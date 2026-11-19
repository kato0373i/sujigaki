import { z } from "zod";
import { fail, ok, type Result } from "../shared/result.ts";
import type { Attributes } from "./element.ts";
import type { ElementKind } from "./element-kind.ts";

const text = z.string().trim().min(1);

/** 活動の業務手順の属性（FR-002）。担当者は登場人物へのつながりで表すため、ここには持たない */
const activityAttributes = z.strictObject({
  trigger: text.optional(),
  input: text.optional(),
  procedure: text.optional(),
  exceptions: z.array(text).optional(),
  outcome: text.optional(),
  mode: z.enum(["manual", "system"]).optional(),
});

/** 要求の属性（FR-003） */
const requirementAttributes = z.strictObject({
  rationale: text.optional(),
  origin: text.optional(),
  priority: z.enum(["must", "should", "could"]).optional(),
  originalText: text.optional(),
});

/** 情報の項目。RDRA の属性（#attribute）にあたる */
const informationAttributes = z.strictObject({
  items: z
    .array(z.strictObject({ name: text, description: text.optional() }))
    .optional(),
});

/** 区分の値。RDRA のバリエーションの値（#attribute）にあたる */
const variationAttributes = z.strictObject({
  values: z.array(text).optional(),
});

/** 状態のステレオタイプ（#stereotype） */
const stateAttributes = z.strictObject({
  stereotype: text.optional(),
});

const noAttributes = z.strictObject({});

/** 種類ごとの属性のスキーマ（設計書 ADR-005）。YAML の JSON Schema もここから作る */
export const ATTRIBUTE_SCHEMAS: Readonly<Record<ElementKind, z.ZodType>> = {
  requirement: requirementAttributes,
  actor: noAttributes,
  actorGroup: noAttributes,
  externalSystem: noAttributes,
  externalSystemGroup: noAttributes,
  business: noAttributes,
  buc: noAttributes,
  activity: activityAttributes,
  usecase: noAttributes,
  screen: noAttributes,
  event: noAttributes,
  timer: noAttributes,
  context: noAttributes,
  information: informationAttributes,
  stateModel: noAttributes,
  state: stateAttributes,
  condition: noAttributes,
  variation: variationAttributes,
};

export type ActivityAttributes = z.infer<typeof activityAttributes>;
export type RequirementAttributes = z.infer<typeof requirementAttributes>;
export type InformationAttributes = z.infer<typeof informationAttributes>;
export type VariationAttributes = z.infer<typeof variationAttributes>;
export type StateAttributes = z.infer<typeof stateAttributes>;

/** 画面とエラーのメッセージに出す属性の名前 */
export const ATTRIBUTE_LABELS: Readonly<Record<string, string>> = {
  trigger: "開始のきっかけ",
  input: "入力",
  procedure: "手順の概要",
  exceptions: "例外",
  outcome: "終了状態",
  mode: "区分",
  rationale: "根拠",
  origin: "発生源",
  priority: "優先度",
  originalText: "要望の原文",
  items: "項目",
  name: "名前",
  description: "説明",
  values: "区分の値",
  stereotype: "ステレオタイプ",
};

/** 種類に合わせて属性を検査し、前後の空白を除いた値を返す */
export function parseAttributes(
  kind: ElementKind,
  value: unknown,
): Result<Attributes> {
  const parsed = ATTRIBUTE_SCHEMAS[kind].safeParse(value);
  if (parsed.success) return ok(parsed.data as Attributes);
  const issue = parsed.error.issues[0];
  const key = issue?.path.findLast((p) => typeof p === "string");
  if (issue?.code === "unrecognized_keys") {
    const names = issue.keys.join("、");
    return fail(
      "VALIDATION_FAILED",
      `この種類の要素には「${names}」を持てません。`,
    );
  }
  const label = key ? (ATTRIBUTE_LABELS[key] ?? key) : "属性";
  return fail("VALIDATION_FAILED", `「${label}」の値が正しくありません。`);
}
