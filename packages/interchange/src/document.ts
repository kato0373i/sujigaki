import type {
  DecisionSnapshot,
  ElementSnapshot,
  LayoutSnapshot,
  ProjectSettings,
  QuestionSnapshot,
} from "@sujigaki/domain";

/** YAML の形式のバージョン（NFR-015）。形式を変えたら上げ、古いバージョンを変換して読み込む */
export const FORMAT_VERSION = 1;

/** モデル全体を1つにまとめたもの。YAML に書き出し、読み込む単位（FR-050） */
export interface ProjectDocument {
  readonly project: ProjectSettings;
  readonly elements: readonly ElementSnapshot[];
  readonly questions: readonly QuestionSnapshot[];
  readonly decisions: readonly DecisionSnapshot[];
  readonly layouts: readonly LayoutSnapshot[];
}

const byKey =
  <T>(key: (item: T) => string) =>
  (a: T, b: T) => {
    const x = key(a);
    const y = key(b);
    return x < y ? -1 : x > y ? 1 : 0;
  };

/**
 * 並びを決まった順にそろえる。要素・つながり・問い・決定記録は ID の順、図の配置は業務フローの ID の順にする。
 * 保存のたびに並びが変わって、Git の差分が大きくならないようにする（設計書 5.4 節）。
 */
export function normalizeDocument(document: ProjectDocument): ProjectDocument {
  return {
    project: document.project,
    elements: [...document.elements]
      .map((e) => ({
        ...e,
        relations: [...e.relations].sort(byKey((r) => r.id)),
      }))
      .sort(byKey((e) => e.id)),
    questions: [...document.questions].sort(byKey((q) => q.id)),
    decisions: [...document.decisions].sort(byKey((d) => d.id)),
    layouts: [...document.layouts]
      .map((l) => ({
        ...l,
        positions: Object.fromEntries(
          Object.entries(l.positions).sort(byKey(([id]) => id)),
        ) as LayoutSnapshot["positions"],
      }))
      .sort(byKey((l) => l.bucId)),
  };
}
