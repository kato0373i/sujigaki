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
import { fail, ok, type ProjectSettings, type Result } from "@sujigaki/domain";
import {
  isProjectFile,
  type ProjectDocument,
  type ReadIssue,
  readProjectFolder,
  SETTINGS_FILE,
  writeProjectFolder,
} from "@sujigaki/interchange";
import { applyChangeSet } from "./change-set.ts";
import type {
  ChangeSet,
  ProjectRepository,
  StoredProject,
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

export interface FileProjectRepositoryOptions {
  /** プロジェクトのフォルダー */
  readonly folder: string;
  /** ローカルモードで扱う、ただ1つのプロジェクトの ID */
  readonly projectId: string;
}

/**
 * ローカルモードのフォルダーに保存するリポジトリ（設計書 5.4 節）。
 * 読み込んだときのファイルの内容のハッシュを覚えておき、保存の前に比べて、外で変わったことを見つける。
 * 操作の記録はファイルに書かない。変更履歴は Git の履歴を使う（FR-072）
 */
export class FileProjectRepository implements ProjectRepository {
  private readonly folder: string;
  private readonly projectId: string;
  private knownHash: string | null = null;
  private revision = 0;
  /** 保存を1件ずつ処理するための待ち行列 */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: FileProjectRepositoryOptions) {
    this.folder = options.folder;
    this.projectId = options.projectId;
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
      await this.writeFiles(files, writeProjectFolder(document));
      return ok({ document, revision: this.revision });
    });
  }

  load(projectId: string): Promise<StoredProject | null> {
    return this.exclusive(async () => {
      if (projectId !== this.projectId) return null;
      const files = await this.readFiles();
      if (!files.has(SETTINGS_FILE)) return null;
      const document = this.parse(files);
      this.knownHash = hashOf(files);
      return { document, revision: this.revision };
    });
  }

  commit(
    projectId: string,
    changes: ChangeSet,
  ): Promise<Result<{ readonly revision: number }>> {
    return this.exclusive(async () => {
      if (projectId !== this.projectId) {
        return fail("NOT_FOUND", "プロジェクトが見つかりません。");
      }
      const files = await this.readFiles();
      if (!files.has(SETTINGS_FILE)) {
        return fail("NOT_FOUND", "プロジェクトが見つかりません。");
      }
      if (this.knownHash !== null && this.knownHash !== hashOf(files)) {
        return fail(
          "VERSION_CONFLICT",
          "フォルダーのファイルが、ほかのエディターや git pull で変わっています。読み込み直してから保存してください。",
        );
      }
      const applied = applyChangeSet(this.parse(files), changes);
      if (!applied.ok) return applied;
      await this.writeFiles(files, writeProjectFolder(applied.value));
      this.revision += changes.operations.length;
      return ok({ revision: this.revision });
    });
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
    after: ReadonlyMap<string, string>,
  ): Promise<void> {
    for (const [path, text] of after) {
      if (before.get(path) === text) continue;
      const target = join(this.folder, path);
      await mkdir(dirname(target), { recursive: true });
      const temporary = `${target}.tmp`;
      await writeFile(temporary, text, "utf8");
      await rename(temporary, target);
    }
    for (const path of before.keys()) {
      if (!after.has(path)) await rm(join(this.folder, path));
    }
    this.knownHash = hashOf(after);
  }
}

function hashOf(files: ReadonlyMap<string, string>): string {
  const hash = createHash("sha256");
  for (const [path, text] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    hash.update(`${path}\0${text}\0`);
  }
  return hash.digest("hex");
}
