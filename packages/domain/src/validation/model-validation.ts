import { contentHash } from "../model/content-hash.ts";
import type {
  ElementId,
  ElementSnapshot,
  RelationId,
} from "../model/element.ts";
import type { ElementKind } from "../model/element-kind.ts";

/** 検証の規則（要件定義書 FR-040、FR-041）。並び順は一覧での表示の順 */
export const VALIDATION_RULES = [
  "changedAfterReview",
  "brokenRelation",
  "businessWithoutRequirement",
  "systemActivityWithoutUsecase",
  "usecaseWithoutScreen",
  "unusedInformation",
  "unusedScreen",
  "unusedCondition",
  "stateWithoutTransition",
  "activityWithoutActor",
  "summaryTooLong",
] as const;

export type ValidationRule = (typeof VALIDATION_RULES)[number];

export const VALIDATION_RULE_LABELS: Readonly<Record<ValidationRule, string>> =
  {
    changedAfterReview: "確認したあとに内容が変わった",
    brokenRelation: "つながりが切れている",
    businessWithoutRequirement: "要求につながっていない",
    systemActivityWithoutUsecase: "システム操作につながっていない",
    usecaseWithoutScreen: "画面につながっていない",
    unusedInformation: "システム操作から使われていない",
    unusedScreen: "システム操作から使われていない",
    unusedCondition: "システム操作から使われていない",
    stateWithoutTransition: "遷移がない",
    activityWithoutActor: "担当者が未設定",
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
    ...changedAfterReview(model),
    ...brokenRelations(model),
    ...missingConnections(model),
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

  /** element から、有効な kind の要素へのつながりがあるか */
  hasOutgoing(element: ElementSnapshot, kind: ElementKind): boolean {
    return element.relations.some(
      (r) => r.toKind === kind && this.isActive(r.to),
    );
  }

  /** 有効な kind の要素から、element へのつながりがあるか */
  hasIncoming(element: ElementSnapshot, kind: ElementKind): boolean {
    return this.active.some(
      (from) =>
        from.kind === kind && from.relations.some((r) => r.to === element.id),
    );
  }
}

interface ConnectionRule {
  readonly rule: ValidationRule;
  readonly applies: (element: ElementSnapshot) => boolean;
  readonly connected: (model: ModelIndex, element: ElementSnapshot) => boolean;
  readonly message: string;
}

/** 要素がつながるべき先につながっているかの規則 */
const CONNECTION_RULES: readonly ConnectionRule[] = [
  {
    rule: "businessWithoutRequirement",
    applies: (e) => e.kind === "business",
    connected: (m, e) => m.hasIncoming(e, "requirement"),
    message: "この業務につながる要求がありません。",
  },
  {
    rule: "systemActivityWithoutUsecase",
    applies: (e) => e.kind === "activity" && e.attributes.mode === "system",
    connected: (m, e) => m.hasOutgoing(e, "usecase"),
    message:
      "区分がシステム利用の活動ですが、システム操作につながっていません。",
  },
  {
    rule: "usecaseWithoutScreen",
    applies: (e) => e.kind === "usecase",
    connected: (m, e) => m.hasOutgoing(e, "screen"),
    message: "このシステム操作は画面につながっていません。",
  },
  {
    rule: "unusedInformation",
    applies: (e) => e.kind === "information",
    connected: (m, e) => m.hasIncoming(e, "usecase"),
    message: "この情報を使うシステム操作がありません。",
  },
  {
    rule: "unusedScreen",
    applies: (e) => e.kind === "screen",
    connected: (m, e) => m.hasIncoming(e, "usecase"),
    message: "この画面を使うシステム操作がありません。",
  },
  {
    rule: "unusedCondition",
    applies: (e) => e.kind === "condition",
    connected: (m, e) => m.hasIncoming(e, "usecase"),
    message: "この業務ルールを使うシステム操作がありません。",
  },
  {
    // 状態の流れの中で、どこからも移ってこず、どこへも移らない状態は、遷移を書き忘れている（#153）
    rule: "stateWithoutTransition",
    applies: (e) => e.kind === "state",
    connected: (m, e) =>
      m.hasIncoming(e, "state") ||
      m.hasIncoming(e, "usecase") ||
      m.hasOutgoing(e, "state") ||
      m.hasOutgoing(e, "usecase"),
    message: "この状態に出入りする遷移がありません。",
  },
  {
    rule: "activityWithoutActor",
    applies: (e) => e.kind === "activity",
    connected: (m, e) => m.hasOutgoing(e, "actor"),
    message: "この活動の担当者が設定されていません。",
  },
];

function missingConnections(model: ModelIndex): Violation[] {
  return CONNECTION_RULES.flatMap((rule) =>
    model.active
      .filter((e) => rule.applies(e) && !rule.connected(model, e))
      .map((e) => ({
        rule: rule.rule,
        elementId: e.id,
        message: rule.message,
      })),
  );
}

/**
 * 確認状態を変えたときの内容と、今の内容が違う要素（FR-041）。
 * ツールで編集すれば未レビューに戻るため、ファイルを直接書き換えたときに見つかる
 */
function changedAfterReview(model: ModelIndex): Violation[] {
  return model.active
    .filter(
      (e) =>
        e.reviewState !== "unreviewed" &&
        e.reviewedHash !== null &&
        e.reviewedHash !== contentHash(e),
    )
    .map((e) => ({
      rule: "changedAfterReview" as const,
      elementId: e.id,
      message:
        "確認したあとに、ツールの外で内容が変わっています。内容を確かめ直してください。",
    }));
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
