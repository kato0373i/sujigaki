import {
  ELEMENT_KIND_LABELS,
  type ElementId,
  type ElementSnapshot,
  type JsonValue,
  jsonEqual,
} from "@sujigaki/domain";

/** 取り込みで比べる内容の項目。links 以外が変わると、確認状態が未レビューに戻る（FR-013） */
export type ContentField =
  | "name"
  | "summary"
  | "attributes"
  | "links"
  | "relations";

/**
 * 取り込みの変更1件。利用者は1件ずつ採否を決める（FR-034、FR-050）。
 * baseVersion は差分を出したときの今の要素のバージョンで、反映するときに競合を見つけるのに使う。
 */
export type ImportChange =
  | { readonly type: "add"; readonly element: ElementSnapshot }
  | {
      readonly type: "update";
      readonly elementId: ElementId;
      readonly baseVersion: number;
      readonly fields: readonly ContentField[];
      /** 今は削除済みで、取り込むと復元するか */
      readonly restores: boolean;
      readonly before: ElementSnapshot;
      readonly after: ElementSnapshot;
    }
  | {
      readonly type: "remove";
      readonly elementId: ElementId;
      readonly baseVersion: number;
      readonly before: ElementSnapshot;
    };

export interface ImportProblem {
  readonly elementId: ElementId;
  readonly message: string;
}

export interface ImportDiff {
  readonly changes: readonly ImportChange[];
  /** 取り込めない要素。変更には含めない */
  readonly problems: readonly ImportProblem[];
}

export interface DiffOptions {
  /**
   * 取り込む側にない要素を、削除の変更にするか。
   * モデル全体を書き出したファイルなら true、AI の提案のように一部だけのときは false にする。
   */
  readonly removeMissing: boolean;
  /** removeMissing のとき、削除の変更にしてよい要素。業務の範囲のファイルで、範囲の外の要素を消さないために使う */
  readonly removeOnly?: ReadonlySet<string>;
}

export const relationKey = (r: { typeId: string; to: string }) =>
  `${r.typeId}\n${r.to}`;

/** 2つの要素の内容のうち、違う項目を返す。確認状態・バージョン・日時は比べない */
export function changedFields(
  before: ElementSnapshot,
  after: ElementSnapshot,
): ContentField[] {
  const fields: ContentField[] = [];
  if (before.name !== after.name) fields.push("name");
  if (before.summary !== after.summary) fields.push("summary");
  if (!jsonEqual(before.attributes, after.attributes))
    fields.push("attributes");
  if (
    !jsonEqual(
      before.links as unknown as JsonValue,
      after.links as unknown as JsonValue,
    )
  ) {
    fields.push("links");
  }
  const keys = (e: ElementSnapshot) => new Set(e.relations.map(relationKey));
  const a = keys(before);
  const b = keys(after);
  if (a.size !== b.size || [...a].some((k) => !b.has(k))) {
    fields.push("relations");
  }
  return fields;
}

/**
 * 今のモデルと取り込む内容の差分を出す。要素は ID で対応させ、取り込む側の確認状態は使わない。
 * 取り込む側で削除済みの要素は、今のモデルにあれば削除の変更にし、なければ無視する。
 */
export function diffElements(
  current: readonly ElementSnapshot[],
  incoming: readonly ElementSnapshot[],
  options: DiffOptions,
): ImportDiff {
  const byId = new Map(current.map((e) => [e.id, e]));
  const incomingIds = new Set(incoming.map((e) => e.id));
  const changes: ImportChange[] = [];
  const problems: ImportProblem[] = [];

  for (const after of incoming) {
    const before = byId.get(after.id);
    if (!before) {
      if (after.deletedAt === null)
        changes.push({ type: "add", element: after });
      continue;
    }
    if (before.kind !== after.kind) {
      problems.push({
        elementId: after.id,
        message: `要素「${before.name}」は今のモデルでは「${ELEMENT_KIND_LABELS[before.kind]}」です。要素の種類は変えられません。`,
      });
      continue;
    }
    if (after.deletedAt !== null) {
      if (before.deletedAt === null) changes.push(removal(before));
      continue;
    }
    const fields = changedFields(before, after);
    const restores = before.deletedAt !== null;
    if (fields.length > 0 || restores) {
      changes.push({
        type: "update",
        elementId: after.id,
        baseVersion: before.version,
        fields,
        restores,
        before,
        after,
      });
    }
  }

  if (options.removeMissing) {
    for (const before of current) {
      if (
        before.deletedAt === null &&
        !incomingIds.has(before.id) &&
        (options.removeOnly?.has(before.id) ?? true)
      ) {
        changes.push(removal(before));
      }
    }
  }
  return { changes, problems };
}

function removal(before: ElementSnapshot): ImportChange {
  return {
    type: "remove",
    elementId: before.id,
    baseVersion: before.version,
    before,
  };
}
