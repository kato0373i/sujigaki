import type { ElementKind } from "./element-kind.ts";

/**
 * RDRA の関連データでのタグ。null は関連データに書き出さない、このツール独自の関係を表す。
 * 説明（#comment）・項目（#attribute）・ステレオタイプ（#stereotype）は要素の属性として持つため、
 * つながりの種類には含めない。
 */
export type RelatedDataTag = "#child" | "#edge" | "#arrow" | null;

export interface RelationType {
  /** 元と先の種類を `-` でつないだ識別子（例: `activity-usecase`） */
  readonly id: string;
  /** 元の要素の種類。つながりは元の要素が持つ（設計書 ADR-004） */
  readonly from: ElementKind;
  readonly to: ElementKind;
  readonly tag: RelatedDataTag;
}

function define(
  tag: RelatedDataTag,
  from: ElementKind,
  to: ElementKind,
): RelationType {
  return { id: `${from}-${to}`, from, to, tag };
}

/**
 * つながりの種類の定義。RDRA 定義・分析シートの関連データのテンプレート（45行）から、
 * 属性として持つ行を除いた33種類に、要求のつながり2種類を加えたもの。
 * 出典: docs/research/rdra-related-data-format.md
 */
export const RELATION_TYPES: readonly RelationType[] = [
  // #child: 親子関係
  define("#child", "business", "buc"),
  define("#child", "buc", "activity"),
  define("#child", "context", "information"),
  define("#child", "context", "stateModel"),
  define("#child", "stateModel", "state"),
  define("#child", "actorGroup", "actor"),
  define("#child", "externalSystemGroup", "externalSystem"),
  define("#child", "context", "condition"),
  define("#child", "context", "variation"),
  // #edge: 向きを持たないつながり
  define("#edge", "activity", "usecase"),
  define("#edge", "activity", "screen"),
  define("#edge", "activity", "actor"),
  define("#edge", "activity", "information"),
  define("#edge", "activity", "timer"),
  define("#edge", "usecase", "screen"),
  define("#edge", "usecase", "event"),
  define("#edge", "usecase", "information"),
  define("#edge", "usecase", "condition"),
  define("#edge", "usecase", "timer"),
  define("#edge", "information", "information"),
  define("#edge", "information", "stateModel"),
  define("#edge", "information", "variation"),
  define("#edge", "screen", "actor"),
  define("#edge", "screen", "externalSystem"),
  define("#edge", "event", "actor"),
  define("#edge", "event", "externalSystem"),
  define("#edge", "actor", "information"),
  define("#edge", "condition", "variation"),
  define("#edge", "condition", "stateModel"),
  // #arrow: 向きを持つ流れ
  define("#arrow", "activity", "activity"),
  define("#arrow", "state", "usecase"),
  define("#arrow", "usecase", "state"),
  define("#arrow", "state", "state"),
  // 関連データにない要求のつながり（要件定義書 4章）
  define(null, "requirement", "business"),
  define(null, "requirement", "actor"),
];
