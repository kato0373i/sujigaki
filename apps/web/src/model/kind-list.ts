import {
  ELEMENT_KIND_LABELS,
  ELEMENT_KINDS,
  type ElementKind,
  type ElementSnapshot,
} from "@sujigaki/domain";
import { connectedElements } from "./relation-editor.ts";

/** 一覧の左に並べる種類。要素のない種類も数を0として出す */
export interface KindCount {
  readonly kind: ElementKind;
  readonly label: string;
  readonly count: number;
}

/** 一覧の1行 */
export interface KindListRow {
  readonly element: ElementSnapshot;
  /** つながっている要素の数。同じ要素との複数のつながりは1つと数える */
  readonly connections: number;
}

/** すべての種類と、種類ごとの削除されていない要素の数（画面設計書 S-13） */
export function kindCounts(elements: readonly ElementSnapshot[]): KindCount[] {
  const counts = new Map<ElementKind, number>();
  for (const e of elements) {
    if (e.deletedAt === null) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  }
  return ELEMENT_KINDS.map((kind) => ({
    kind,
    label: ELEMENT_KIND_LABELS[kind],
    count: counts.get(kind) ?? 0,
  }));
}

/** 種類を選ばずに開いたときの種類。要素のある最初の種類にし、要素がなければ最初の種類にする */
export function defaultKind(elements: readonly ElementSnapshot[]): ElementKind {
  return (
    kindCounts(elements).find((k) => k.count > 0)?.kind ?? ELEMENT_KINDS[0]
  );
}

/**
 * 選んだ種類の要素を、名前の順に並べる。text があれば名前と要約で絞り込む。
 * 英字の大文字と小文字は区別しない。削除済みの要素は出さない
 */
export function kindListRows(
  elements: readonly ElementSnapshot[],
  kind: ElementKind,
  text = "",
): KindListRow[] {
  const query = text.trim().toLowerCase();
  const active = elements.filter((e) => e.deletedAt === null);
  return active
    .filter(
      (e) =>
        e.kind === kind &&
        (query === "" ||
          e.name.toLowerCase().includes(query) ||
          e.summary.toLowerCase().includes(query)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ja"))
    .map((element) => ({
      element,
      connections: connectedElements(element, active).length,
    }));
}
