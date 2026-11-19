import type { ElementId, ElementKind, ElementSnapshot } from "@sujigaki/domain";
import { Document } from "yaml";
import { z } from "zod";
import { normalizeDocument, type ProjectDocument } from "./document.ts";
import {
  decodeDocument,
  encodeDocument,
  type Path,
  parseYaml,
  type ReadIssue,
  type ReadResult,
} from "./yaml-codec.ts";

/** フォルダーの中のファイル。キーはフォルダーからの位置（例: `businesses/b1.yaml`） */
export type ProjectFiles = ReadonlyMap<string, string>;

export const SETTINGS_FILE = "sujigaki.yaml";
const UNASSIGNED = "unassigned";

/** 1つのファイルに置く種類（設計書 5.4 節） */
const FIXED_FILES: Partial<Record<ElementKind, string>> = {
  requirement: "requirements.yaml",
  actor: "actors.yaml",
  actorGroup: "actors.yaml",
  externalSystem: "actors.yaml",
  externalSystemGroup: "actors.yaml",
  usecase: "system/usecases.yaml",
  screen: "system/screens.yaml",
  event: "system/events.yaml",
  timer: "system/timers.yaml",
};

/** 業務と分類のファイルに置く種類と、親をたどる順 */
const BUSINESS_CHAIN: Partial<Record<ElementKind, ElementKind>> = {
  buc: "business",
  activity: "buc",
};
const CONTEXT_CHAIN: Partial<Record<ElementKind, ElementKind>> = {
  information: "context",
  stateModel: "context",
  condition: "context",
  variation: "context",
  state: "stateModel",
};

const PROJECT_FILE_PATTERN =
  /^(sujigaki|requirements|actors|deliberation)\.yaml$|^system\/(usecases|screens|events|timers)\.yaml$|^(businesses|contexts|layouts)\/[A-Za-z0-9_-]+\.yaml$/;

/** sujigaki が読み書きするファイルか。ほかのファイル（README など）は読まない */
export function isProjectFile(path: string): boolean {
  return PROJECT_FILE_PATTERN.test(path);
}

/**
 * モデルを、ローカルモードのフォルダーのファイルに分ける（設計書 5.4 節、ADR-006）。
 * 中身のないファイルは作らない。返したファイルにない sujigaki のファイルは、呼び出し側で消す。
 */
export function writeProjectFolder(
  document: ProjectDocument,
): Map<string, string> {
  const doc = normalizeDocument(document);
  const encoded = encodeDocument(doc);
  const files = new Map<string, string>();
  const write = (path: string, value: unknown, comment?: string) => {
    const yaml = new Document(value);
    if (comment) yaml.commentBefore = ` ${comment}`;
    files.set(path, yaml.toString({ lineWidth: 0 }));
  };

  write(SETTINGS_FILE, {
    format: encoded.format,
    version: encoded.version,
    project: encoded.project,
  });

  const placement = placeElements(doc.elements);
  const grouped = new Map<string, unknown[]>();
  doc.elements.forEach((element, index) => {
    const path = placement.get(element.id) ?? "";
    grouped.set(path, [...(grouped.get(path) ?? []), encoded.elements[index]]);
  });
  const byId = new Map(doc.elements.map((e) => [e.id, e]));
  for (const [path, elements] of [...grouped].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    write(path, { elements }, headerOf(path, byId));
  }

  if (encoded.questions.length > 0 || encoded.decisions.length > 0) {
    write("deliberation.yaml", {
      questions: encoded.questions,
      decisions: encoded.decisions,
    });
  }
  doc.layouts.forEach((layout, index) => {
    write(`layouts/${layout.bucId}.yaml`, encoded.layouts[index]);
  });
  return files;
}

/** 業務と分類のファイルの先頭に、その名前を書く。ファイル名は ID のため、名前がわからないからである */
function headerOf(
  path: string,
  byId: ReadonlyMap<ElementId, ElementSnapshot>,
): string | undefined {
  const match = /^(businesses|contexts)\/(.+)\.yaml$/.exec(path);
  if (!match) return undefined;
  const [, dir, id] = match;
  const label = dir === "businesses" ? "業務" : "分類";
  if (id === UNASSIGNED) return `${label}に属さない要素`;
  const owner = byId.get(id as ElementId);
  return owner ? `${label}: ${owner.name}` : undefined;
}

/** 要素ごとに、置くファイルを決める */
function placeElements(
  elements: readonly ElementSnapshot[],
): Map<ElementId, string> {
  const kindOf = new Map(elements.map((e) => [e.id, e.kind]));
  // 子の ID から、子を持つ親の ID への対応。親が複数なら ID の小さいほうを使う。
  // つながりに書いた先の種類ではなく、先の要素の実際の種類で親子を決める
  const parentOf = new Map<ElementId, ElementId>();
  for (const parent of elements) {
    for (const r of parent.relations) {
      const childKind = kindOf.get(r.to);
      if (childKind === undefined) continue;
      const isChild =
        BUSINESS_CHAIN[childKind] === parent.kind ||
        CONTEXT_CHAIN[childKind] === parent.kind;
      const existing = parentOf.get(r.to);
      if (isChild && (existing === undefined || parent.id < existing)) {
        parentOf.set(r.to, parent.id);
      }
    }
  }
  const ownerOf = (id: ElementId, root: ElementKind): ElementId | null => {
    const visited = new Set<ElementId>();
    let current: ElementId | undefined = id;
    while (current !== undefined && !visited.has(current)) {
      if (kindOf.get(current) === root) return current;
      visited.add(current);
      current = parentOf.get(current);
    }
    return null;
  };

  const placement = new Map<ElementId, string>();
  for (const e of elements) {
    const fixed = FIXED_FILES[e.kind];
    if (fixed) {
      placement.set(e.id, fixed);
    } else if (e.kind === "business" || BUSINESS_CHAIN[e.kind]) {
      placement.set(
        e.id,
        `businesses/${ownerOf(e.id, "business") ?? UNASSIGNED}.yaml`,
      );
    } else {
      placement.set(
        e.id,
        `contexts/${ownerOf(e.id, "context") ?? UNASSIGNED}.yaml`,
      );
    }
  }
  return placement;
}

const elementFileSchema = z
  .strictObject({ elements: z.array(z.unknown()).optional() })
  .nullable();
const deliberationFileSchema = z
  .strictObject({
    questions: z.array(z.unknown()).optional(),
    decisions: z.array(z.unknown()).optional(),
  })
  .nullable();

interface Origin {
  readonly file: string;
  readonly prefix: Path;
}

/**
 * フォルダーのファイルをまとめて読み込む。どのファイルのどこが形式に合わないかを、すべて返す。
 * 要素がどのファイルにあっても読み込み、次に書き出すときに決まったファイルへ移す。
 */
export function readProjectFolder(files: ProjectFiles): ReadResult {
  const paths = [...files.keys()].filter(isProjectFile).sort();
  if (!files.has(SETTINGS_FILE)) {
    return {
      ok: false,
      issues: [
        {
          file: SETTINGS_FILE,
          path: [],
          line: null,
          message: `${SETTINGS_FILE} がありません。sujigaki のフォルダーではないか、ファイルが消えています。`,
        },
      ],
    };
  }

  const issues: ReadIssue[] = [];
  const locators = new Map<string, (path: Path) => number | null>();
  const merged: Record<string, unknown> & {
    elements: unknown[];
    questions: unknown[];
    decisions: unknown[];
    layouts: unknown[];
  } = { elements: [], questions: [], decisions: [], layouts: [] };
  const origins: Record<
    "elements" | "questions" | "decisions" | "layouts",
    Origin[]
  > = {
    elements: [],
    questions: [],
    decisions: [],
    layouts: [],
  };
  const append = (
    key: keyof typeof origins,
    file: string,
    items: readonly unknown[] | undefined,
  ) => {
    (items ?? []).forEach((item, index) => {
      merged[key].push(item);
      origins[key].push({ file, prefix: [key, index] });
    });
  };

  for (const file of paths) {
    const parsed = parseYaml(files.get(file) ?? "");
    if (!parsed.ok) {
      issues.push(...parsed.issues.map((issue) => ({ ...issue, file })));
      continue;
    }
    locators.set(file, parsed.locate);
    const shapeIssue = (message: string) =>
      issues.push({ file, path: [], line: parsed.locate([]), message });

    if (file === SETTINGS_FILE) {
      const value = parsed.value;
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const lists = Object.keys(value).filter((key) => key in origins);
        if (lists.length > 0) {
          shapeIssue(
            `${SETTINGS_FILE} には、形式のバージョンとプロジェクトの設定だけを書いてください。`,
          );
          continue;
        }
        Object.assign(merged, value);
      } else {
        shapeIssue("sujigaki の YAML ファイルではありません。");
      }
    } else if (file === "deliberation.yaml") {
      const value = deliberationFileSchema.safeParse(parsed.value);
      if (!value.success) {
        shapeIssue(
          "問いの一覧（questions）と決定記録の一覧（decisions）だけを書いてください。",
        );
        continue;
      }
      append("questions", file, value.data?.questions);
      append("decisions", file, value.data?.decisions);
    } else if (file.startsWith("layouts/")) {
      merged.layouts.push(parsed.value);
      origins.layouts.push({ file, prefix: [] });
    } else {
      const value = elementFileSchema.safeParse(parsed.value);
      if (!value.success) {
        shapeIssue("要素の一覧（elements）だけを書いてください。");
        continue;
      }
      append("elements", file, value.data?.elements);
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  const decoded = decodeDocument(merged);
  if (decoded.ok) return decoded;
  return {
    ok: false,
    issues: decoded.issues.map((issue) => {
      const [key, index, ...rest] = issue.path;
      const origin =
        typeof index === "number" && typeof key === "string" && key in origins
          ? origins[key as keyof typeof origins][index]
          : undefined;
      const file = origin?.file ?? SETTINGS_FILE;
      const path = origin ? [...origin.prefix, ...rest] : issue.path;
      return {
        file,
        path,
        line: locators.get(file)?.(path) ?? null,
        message: issue.message,
      };
    }),
  };
}
