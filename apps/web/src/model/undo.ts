import type { ElementSnapshot } from "@sujigaki/domain";

/** 元に戻せる回数（FR-014） */
export const UNDO_LIMIT = 20;

/** 1つの要素の、操作の前と後 */
export interface UndoChange {
  /** 操作の前の要素。操作で追加した要素では null */
  readonly before: ElementSnapshot | null;
  readonly after: ElementSnapshot;
}

/** 元に戻せる1回の操作。要素を作ってつなぐなど、まとめて行った変更を1つにする */
export interface UndoEntry {
  /** 戻す操作の説明（「『受付担当』の削除」など） */
  readonly label: string;
  readonly changes: readonly UndoChange[];
}

/** change-sets に送る、元に戻す変更（設計書 5.6 節） */
export type UndoRequestChange =
  | {
      readonly type: "update";
      readonly baseVersion: number;
      readonly element: ElementInput;
    }
  | {
      readonly type: "remove";
      readonly elementId: string;
      readonly baseVersion: number;
    };

interface ElementInput {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly summary: string;
  readonly attributes: ElementSnapshot["attributes"];
  readonly links: ElementSnapshot["links"];
  readonly relations: readonly { id: string; typeId: string; to: string }[];
}

export type UndoPlan =
  | { readonly ok: true; readonly changes: readonly UndoRequestChange[] }
  | { readonly ok: false; readonly message: string };

/** 同じ要素が何度も変わったら、最初の前と最後の後をまとめて1つにする */
export function mergeChanges(changes: readonly UndoChange[]): UndoChange[] {
  const merged = new Map<string, UndoChange>();
  for (const change of changes) {
    const earlier = merged.get(change.after.id);
    merged.set(change.after.id, {
      before: earlier ? earlier.before : change.before,
      after: change.after,
    });
  }
  return [...merged.values()];
}

const relationKeys = (e: ElementSnapshot) =>
  e.relations.map((r) => `${r.typeId}\n${r.to}`).sort();

/** 内容（名前・要約・属性・外部リンク・つながり・削除されているか）が同じか。確認状態とバージョンは比べない */
export function sameContent(a: ElementSnapshot, b: ElementSnapshot): boolean {
  return (
    a.name === b.name &&
    a.summary === b.summary &&
    JSON.stringify(a.attributes) === JSON.stringify(b.attributes) &&
    JSON.stringify(a.links) === JSON.stringify(b.links) &&
    JSON.stringify(relationKeys(a)) === JSON.stringify(relationKeys(b)) &&
    (a.deletedAt === null) === (b.deletedAt === null)
  );
}

const inputOf = (e: ElementSnapshot): ElementInput => ({
  id: e.id,
  kind: e.kind,
  name: e.name,
  summary: e.summary,
  attributes: e.attributes,
  links: e.links,
  relations: e.relations.map((r) => ({ id: r.id, typeId: r.typeId, to: r.to })),
});

/**
 * 操作を元に戻す変更を作る（FR-014）。current は今の要素で、削除済みの要素も含める。
 * 操作のあとで内容が変わった要素があれば、何も戻さずに理由を返す。
 * 追加した要素と、操作で復元した要素は削除にし、ほかの要素は操作の前の内容に戻す
 */
export function undoPlan(
  entry: UndoEntry,
  current: ReadonlyMap<string, ElementSnapshot>,
): UndoPlan {
  const changes: UndoRequestChange[] = [];
  for (const { before, after } of mergeChanges(entry.changes)) {
    const now = current.get(after.id);
    if (!now)
      return {
        ok: false,
        message: `「${after.name}」が見つからないため、元に戻せません。`,
      };
    if (!sameContent(now, after))
      return {
        ok: false,
        message: `「${after.name}」はこの操作のあとに変わったため、元に戻せません。`,
      };
    if (before === null || before.deletedAt !== null) {
      if (now.deletedAt === null)
        changes.push({
          type: "remove",
          elementId: now.id,
          baseVersion: now.version,
        });
      continue;
    }
    if (sameContent(now, before)) continue;
    changes.push({
      type: "update",
      baseVersion: now.version,
      element: inputOf(before),
    });
  }
  if (changes.length === 0)
    return { ok: false, message: "元に戻す変更はありません。" };
  return { ok: true, changes };
}

/** 内容の保存の説明。変えた項目で言い方を変える */
export function updateLabel(element: ElementSnapshot, changes: object): string {
  const keys = Object.keys(changes);
  if (keys.length === 1 && keys[0] === "links")
    return `「${element.name}」の外部リンクの変更`;
  if (keys.length === 1 && keys[0] === "name")
    return `「${element.name}」の名前の変更`;
  return `「${element.name}」の内容の変更`;
}
