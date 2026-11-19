/**
 * 要素の種類。識別子は RDRA の用語をもとにし、画面では表示名を使う（要件定義書 4.1 節）。
 * 項目（属性）と区分の値は、情報と区分の値オブジェクトとして持つため、ここには含めない。
 */
export const ELEMENT_KINDS = [
  "requirement",
  "actor",
  "actorGroup",
  "externalSystem",
  "externalSystemGroup",
  "business",
  "buc",
  "activity",
  "usecase",
  "screen",
  "event",
  "timer",
  "context",
  "information",
  "stateModel",
  "state",
  "condition",
  "variation",
] as const;

export type ElementKind = (typeof ELEMENT_KINDS)[number];

export const ELEMENT_KIND_LABELS: Readonly<Record<ElementKind, string>> = {
  requirement: "要求",
  actor: "登場人物",
  actorGroup: "登場人物のグループ",
  externalSystem: "外部システム",
  externalSystemGroup: "外部システムのグループ",
  business: "業務",
  buc: "業務フロー",
  activity: "活動",
  usecase: "システム操作",
  screen: "画面",
  event: "イベント",
  timer: "定期処理",
  context: "分類",
  information: "情報",
  stateModel: "状態の流れ",
  state: "状態",
  condition: "業務ルール",
  variation: "区分",
};

export function isElementKind(value: string): value is ElementKind {
  return (ELEMENT_KINDS as readonly string[]).includes(value);
}
