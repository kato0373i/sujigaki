import type {
  ElementId,
  ElementSnapshot,
  RelationId,
} from "../model/element.ts";

/** 検証の規則（要件定義書 FR-040）。並び順は一覧での表示の順 */
export const VALIDATION_RULES = ["brokenRelation", "summaryTooLong"] as const;

export type ValidationRule = (typeof VALIDATION_RULES)[number];

export const VALIDATION_RULE_LABELS: Readonly<Record<ValidationRule, string>> =
  {
    brokenRelation: "つながりが切れている",
    summaryTooLong: "要約が長すぎる",
  };

export interface Violation {
  readonly rule: ValidationRule;
  readonly elementId: ElementId;
  /** 切れたつながりのように、違反がつながりにあるときのつながりの ID */
  readonly relationId?: RelationId;
  readonly message: string;
}

export interface ValidationOptions {
  /** プロジェクトの要約の上限（FR-005） */
  readonly summaryMaxLength: number;
}

/**
 * モデルを検証し、違反を返す。違反があっても保存はできるため、結果は保存しない。
 * 削除済みの要素は検証せず、削除済みの要素へのつながりは切れたものとして扱う。
 */
export function validateModel(
  elements: readonly ElementSnapshot[],
  options: ValidationOptions,
): Violation[] {
  const model = new ModelIndex(elements);
  const violations = [
    ...brokenRelations(model),
    ...summariesTooLong(model, options.summaryMaxLength),
  ];
  return violations.sort(
    (a, b) =>
      VALIDATION_RULES.indexOf(a.rule) - VALIDATION_RULES.indexOf(b.rule),
  );
}

/** 有効な要素と、その間のつながりを引くための索引 */
class ModelIndex {
  readonly active: readonly ElementSnapshot[];
  private readonly activeIds: ReadonlySet<ElementId>;

  constructor(elements: readonly ElementSnapshot[]) {
    this.active = elements.filter((e) => e.deletedAt === null);
    this.activeIds = new Set(this.active.map((e) => e.id));
  }

  isActive(id: ElementId): boolean {
    return this.activeIds.has(id);
  }
}

function brokenRelations(model: ModelIndex): Violation[] {
  return model.active.flatMap((element) =>
    element.relations
      .filter((relation) => !model.isActive(relation.to))
      .map((relation) => ({
        rule: "brokenRelation" as const,
        elementId: element.id,
        relationId: relation.id,
        message: "つながりの先の要素がないか、削除されています。",
      })),
  );
}

function summariesTooLong(model: ModelIndex, max: number): Violation[] {
  return model.active.flatMap((element) => {
    const length = [...element.summary].length;
    if (length <= max) return [];
    return [
      {
        rule: "summaryTooLong" as const,
        elementId: element.id,
        message: `要約が${length}字あります。上限は${max}字です。長い説明は外部リンクに移してください。`,
      },
    ];
  });
}
