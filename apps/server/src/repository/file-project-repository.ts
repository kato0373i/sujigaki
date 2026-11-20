import { createHash } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import {
  fail,
  type JsonValue,
  jsonEqual,
  ok,
  type ProjectSettings,
  type Result,
} from "@sujigaki/domain";
import {
  isProjectFile,
  type ProjectDocument,
  type ReadIssue,
  readProjectFolder,
  SETTINGS_FILE,
  writeProjectFolder,
} from "@sujigaki/interchange";
import { applyChangeSet } from "./change-set.ts";
import {
  type ChangeSet,
  type ChangesAfter,
  type OperationRecord,
  type ProjectRepository,
  type StoredProject,
  sliceChanges,
} from "./project-repository.ts";

/** フォルダーのファイルが形式に合わず、読み込めない */
export class ProjectFilesInvalidError extends Error {
  readonly issues: readonly ReadIssue[];

  constructor(issues: readonly ReadIssue[]) {
    super("プロジェクトのファイルを読み込めません。");
    this.name = "ProjectFilesInvalidError";
    this.issues = issues;
  }
}

/** フォルダーに書き込めない（FR-061）。権限がない、ディスクがいっぱい、などのとき */
export class ProjectFilesWriteError extends Error {
  readonly path: string;

  constructor(path: string, cause: unknown) {
    super("フォルダーに書き込めませんでした。", { cause });
    this.name = "ProjectFilesWriteError";
    this.path = path;
  }
}

const WRITE_ERRORS = new Set(["EACCES", "EPERM", "EROFS", "ENOSPC"]);

export interface FileProjectRepositoryOptions {
  /** プロジェクトのフォルダー */
  readonly folder: string;
  /** ローカルモードで扱う、ただ1つのプロジェクトの ID */
  readonly projectId: string;
  /** 外の変更を記録するときの日時。テストで差し替える */
  readonly now?: () => Date;
  /** 内容が前回と違うときに、読み直すまで待つミリ秒（設計書 5.4 節）。テストで短くする */
  readonly settleMs?: number;
}

/** 内容が落ち着くまで読み直す回数の上限（設計書 5.4 節） */
const SETTLE_RETRIES = 10;
const DEFAULT_SETTLE_MS = 100;

/**
 * ローカルモードのフォルダーに保存するリポジトリ（設計書 5.4 節）。
 * 外部のエディターや git pull でファイルが変わったことは、最後に読み書きしたときのファイルのハッシュと比べて見つける。
 * 見つけたら、内容が変わった要素と図の配置のバージョンを進め、プロジェクトのリビジョンも1つ進める。
 * 古いバージョンのまま保存しようとした画面には VERSION_CONFLICT を返し、リビジョンの変化で再読み込みを促す。
 * 操作の記録はファイルに書かない。変更履歴は Git の履歴を使う（FR-072）。
 * 更新の通知（FR-071）のために、起動してからの操作と外の変更だけをメモリに持つ
 */
export class FileProjectRepository implements ProjectRepository {
  private readonly folder: string;
  private readonly projectId: string;
  /** 最後に読み書きしたときの、ファイルのハッシュと中身 */
  private known: {
    readonly hash: string;
    readonly document: ProjectDocument;
  } | null = null;
  /** 外で変わったために進めたバージョン。次に保存するときにファイルへ書く */
  private readonly bumps = new Map<string, number>();
  /** 起動してからの操作。外の変更は ExternalChange の操作にする。位置がそのままリビジョンになる */
  private readonly operations: OperationRecord[] = [];
  private readonly now: () => Date;
  private readonly settleMs: number;
  /** 保存を1件ずつ処理するための待ち行列 */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: FileProjectRepositoryOptions) {
    this.folder = options.folder;
    this.projectId = options.projectId;
    this.now = options.now ?? (() => new Date());
    this.settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  }

  private get revision(): number {
    return this.operations.length;
  }

  create(
    projectId: string,
    settings: ProjectSettings,
  ): Promise<Result<StoredProject>> {
    return this.exclusive(async () => {
      if (projectId !== this.projectId) {
        return fail(
          "NOT_FOUND",
          "ローカルモードで扱えるプロジェクトは1つだけです。",
        );
      }
      const files = await this.readFiles();
      if (files.has(SETTINGS_FILE)) {
        return fail(
          "VALIDATION_FAILED",
          "このフォルダーには、すでにプロジェクトがあります。",
        );
      }
      const document: ProjectDocument = {
        project: settings,
        elements: [],
        questions: [],
        decisions: [],
        layouts: [],
      };
      await this.writeFiles(files, document);
      return ok({ document, revision: this.revision });
    });
  }

  load(projectId: string): Promise<StoredProject | null> {
    return this.exclusive(async () => {
      if (projectId !== this.projectId) return null;
      const current = await this.readCurrent();
      if (!current) return null;
      return { document: current.document, revision: this.revision };
    });
  }

  commit(
    projectId: string,
    changes: ChangeSet,
  ): Promise<Result<{ readonly revision: number }>> {
    return this.exclusive(async () => {
      const current =
        projectId === this.projectId ? await this.readCurrent() : null;
      if (!current) return fail("NOT_FOUND", "プロジェクトが見つかりません。");
      const applied = applyChangeSet(current.document, changes);
      if (!applied.ok) return applied;
      await this.writeFiles(current.files, applied.value);
      this.bumps.clear();
      this.operations.push(...changes.operations);
      return ok({ revision: this.revision });
    });
  }

  changesAfter(
    projectId: string,
    after: number,
    limit: number,
  ): Promise<ChangesAfter | null> {
    return this.exclusive(async () => {
      if (projectId !== this.projectId) return null;
      // 外の変更を見つけるために、先にフォルダーを読む
      if (!(await this.readCurrent())) return null;
      return sliceChanges(this.operations, after, limit);
    });
  }

  /**
   * フォルダーを読み、外で変わっていれば、変わった要素と図の配置のバージョンを進める。
   * 進めたバージョンは、次に保存するまでメモリに持つ
   */
  private async readCurrent(): Promise<{
    files: Map<string, string>;
    document: ProjectDocument;
  } | null> {
    const files = await this.readSettled();
    if (!files.has(SETTINGS_FILE)) return null;
    const hash = hashOf(files);
    const onDisk = this.parse(files);
    if (this.known && this.known.hash !== hash) {
      const previous = this.known.document;
      const before = new Map(previous.elements.map((e) => [e.id, e]));
      for (const element of onDisk.elements) {
        const seen = before.get(element.id);
        if (seen && !sameContent(seen, this.withBump(element))) {
          this.bumps.set(element.id, seen.version + 1 - element.version);
        }
      }
      const layouts = new Map(previous.layouts.map((l) => [l.bucId, l]));
      for (const layout of onDisk.layouts) {
        const seen = layouts.get(layout.bucId);
        if (seen && !sameContent(seen, this.withBump(layout))) {
          this.bumps.set(
            `layout:${layout.bucId}`,
            seen.version + 1 - layout.version,
          );
        }
      }
      this.operations.push({
        type: "ExternalChange",
        targetType: "project",
        targetId: this.projectId,
        actorId: null,
        occurredAt: this.now().toISOString(),
        before: null,
        after: null,
      });
    }
    const document: ProjectDocument = {
      ...onDisk,
      elements: onDisk.elements.map((e) => this.withBump(e)),
      layouts: onDisk.layouts.map((l) => this.withBump(l)),
    };
    this.known = { hash, document };
    return { files, document };
  }

  private withBump<
    T extends { readonly version: number } & (
      | { readonly id: string }
      | { readonly bucId: string }
    ),
  >(item: T): T {
    const key = "id" in item ? item.id : `layout:${item.bucId}`;
    const bump = this.bumps.get(key) ?? 0;
    return bump === 0 ? item : { ...item, version: item.version + bump };
  }

  private parse(files: ReadonlyMap<string, string>): ProjectDocument {
    const result = readProjectFolder(files);
    if (!result.ok) throw new ProjectFilesInvalidError(result.issues);
    return result.document;
  }

  /** 処理を1件ずつ順に行う。読んでから書くまでの間に、ほかの保存が割り込まないようにする */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * 前回と内容が違えば、少し待って読み直し、2回続けて同じ内容になってから返す（設計書 5.4 節）。
   * エディターや git pull が書いている途中の、書きかけの内容を使わないためである
   */
  private async readSettled(): Promise<Map<string, string>> {
    let files = await this.readFiles();
    if (!this.known || hashOf(files) === this.known.hash) return files;
    for (let i = 0; i < SETTLE_RETRIES; i++) {
      await new Promise((resolve) => setTimeout(resolve, this.settleMs));
      const again = await this.readFiles();
      if (hashOf(again) === hashOf(files)) return again;
      files = again;
    }
    return files;
  }

  /** フォルダーの中の sujigaki のファイルを読む。ほかのファイルは読まない */
  private async readFiles(): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    let entries: string[];
    try {
      entries = await readdir(this.folder, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return files;
      throw error;
    }
    for (const entry of entries.sort()) {
      const path = entry.split(sep).join("/");
      if (isProjectFile(path)) {
        files.set(path, await readFile(join(this.folder, path), "utf8"));
      }
    }
    return files;
  }

  /** 変わったファイルだけを書き、なくなったファイルを消す。書くときは一時ファイルから置き換える */
  private async writeFiles(
    before: ReadonlyMap<string, string>,
    document: ProjectDocument,
  ): Promise<void> {
    const after = writeProjectFolder(document);
    const attempt = async (path: string, write: () => Promise<void>) => {
      try {
        await write();
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code && WRITE_ERRORS.has(code))
          throw new ProjectFilesWriteError(path, error);
        throw error;
      }
    };
    for (const [path, text] of after) {
      if (before.get(path) === text) continue;
      const target = join(this.folder, path);
      await attempt(path, async () => {
        await mkdir(dirname(target), { recursive: true });
        const temporary = `${target}.tmp`;
        await writeFile(temporary, text, "utf8");
        await rename(temporary, target);
      });
    }
    for (const path of before.keys()) {
      if (!after.has(path))
        await attempt(path, () => rm(join(this.folder, path)));
    }
    this.known = { hash: hashOf(after), document: this.parse(after) };
  }
}

function hashOf(files: ReadonlyMap<string, string>): string {
  const hash = createHash("sha256");
  for (const [path, text] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    hash.update(`${path}\0${text}\0`);
  }
  return hash.digest("hex");
}

/** バージョンのほかに違いがあるか */
function sameContent(a: { version: number }, b: { version: number }): boolean {
  return jsonEqual(
    { ...a, version: 0 } as unknown as JsonValue,
    { ...b, version: 0 } as unknown as JsonValue,
  );
}
