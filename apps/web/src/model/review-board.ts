import {
  type Actor,
  BLANK_RULES,
  blankQuestions,
  can,
  type ElementId,
  type ElementSnapshot,
  type QuestionSnapshot,
  type ReviewState,
  type Violation,
} from "@sujigaki/domain";

/** 確認ボードの絞り込み（画面設計書 S-06） */
export type BoardFilter = "mine" | "fix" | "all";

export const BOARD_FILTER_LABELS: Readonly<Record<BoardFilter, string>> = {
  mine: "自分が確認するもの",
  fix: "直すもの",
  all: "すべて",
};

/**
 * 絞り込みごとに出すもの。「自分が確認するもの」は要確認と未レビューの要素と未回答の問い、「直すもの」は要修正と検証の違反。
 * AI の提案や読み込みで作った要素は未レビューから始まるため、確認するものに入れる（#122）
 */
const FILTERS: Readonly<
  Record<
    BoardFilter,
    {
      readonly states: readonly ReviewState[];
      readonly questions: boolean;
      readonly violations: boolean;
    }
  >
> = {
  mine: {
    states: ["needs_check", "unreviewed"],
    questions: true,
    violations: false,
  },
  fix: { states: ["needs_fix"], questions: false, violations: true },
  all: {
    states: ["needs_check", "needs_fix", "unreviewed"],
    questions: true,
    violations: true,
  },
};

/** 絞り込みの既定はロールで変える。業務責任者以上は確認するもの、編集者は直すもの */
export function defaultFilter(actor: Actor): BoardFilter {
  if (can(actor, "approveReview")) return "mine";
  return can(actor, "editElement") ? "fix" : "mine";
}

/** 確認ボードの問い。保存した問いと、空欄から計算した問い（FR-035）を同じ形にする */
export interface BoardQuestion {
  readonly key: string;
  readonly element: ElementSnapshot;
  readonly body: string;
  readonly recommendation: string | null;
  /** 空欄から計算した問いか */
  readonly auto: boolean;
  /** 空欄から作った問いなら、その空欄の名前（属性のキーか actor）。回答で空欄を埋めるのに使う（#121） */
  readonly blank: string | null;
  /** 保存した問い。計算しただけの問いは null */
  readonly saved: QuestionSnapshot | null;
}

export interface BoardGroup {
  /** 業務。どの業務にも属さない要素のまとまりは null */
  readonly business: ElementSnapshot | null;
  readonly states: readonly {
    readonly state: ReviewState;
    readonly elements: readonly ElementSnapshot[];
  }[];
  readonly questions: readonly BoardQuestion[];
  readonly violations: readonly {
    readonly violation: Violation;
    readonly element: ElementSnapshot;
  }[];
}

/**
 * 要素から、属する業務を求める。業務フローは業務の子、活動は業務フローの子、要求はつながる業務に属する。
 * 活動から使われている要素はその活動に、システム操作から使われている要素はそのシステム操作に属する（#122）
 */
function businessIndex(
  active: readonly ElementSnapshot[],
): (id: ElementId) => ElementId | null {
  const parent = new Map<ElementId, ElementId>();
  for (const element of active) {
    for (const r of element.relations) {
      const childKind = r.toKind;
      const isChild =
        (element.kind === "business" && childKind === "buc") ||
        (element.kind === "buc" && childKind === "activity");
      if (isChild && !parent.has(r.to)) parent.set(r.to, element.id);
      if (
        element.kind === "requirement" &&
        childKind === "business" &&
        !parent.has(element.id)
      ) {
        parent.set(element.id, r.to);
      }
    }
  }
  // 活動とシステム操作から使われている要素は、使っている要素に属する。親がすでにあれば変えない
  for (const kind of ["activity", "usecase"] as const) {
    for (const element of active.filter((e) => e.kind === kind)) {
      for (const r of element.relations) {
        if (r.toKind !== "activity" && !parent.has(r.to))
          parent.set(r.to, element.id);
      }
    }
  }
  const kinds = new Map(active.map((e) => [e.id, e.kind]));
  return (id) => {
    const seen = new Set<ElementId>();
    let current: ElementId | undefined = id;
    while (current !== undefined && !seen.has(current)) {
      if (kinds.get(current) === "business") return current;
      seen.add(current);
      current = parent.get(current);
    }
    return null;
  };
}

/**
 * 確認ボードに出す内容を計算する（FR-024）。業務ごとにまとめ、要素を確認状態ごとに、問いと検証の違反と並べる。
 * 何も出すものがない業務は出さない
 */
export function reviewBoardView(
  elements: readonly ElementSnapshot[],
  questions: readonly QuestionSnapshot[],
  violations: readonly Violation[],
  filter: BoardFilter,
  businessId: string | null,
  showBlank = true,
): BoardGroup[] {
  const rule = FILTERS[filter];
  const active = elements.filter((e) => e.deletedAt === null);
  const byId = new Map(active.map((e) => [e.id as string, e]));
  const businessOf = businessIndex(active);

  const allQuestions: BoardQuestion[] = rule.questions
    ? [
        ...questions
          .filter((q) => q.state === "open")
          .flatMap((q) => {
            const element = byId.get(q.elementId);
            return element
              ? [
                  {
                    key: q.id,
                    element,
                    body: q.body,
                    recommendation: q.recommendation,
                    auto: q.authorType === "auto",
                    blank:
                      q.authorType === "auto"
                        ? (BLANK_RULES.find(
                            (rule) =>
                              rule.kind === element.kind &&
                              rule.body === q.body,
                          )?.blank ?? null)
                        : null,
                    saved: q,
                  },
                ]
              : [];
          }),
        ...(showBlank ? blankQuestions(active, questions) : []).flatMap((q) => {
          const element = byId.get(q.elementId);
          return element
            ? [
                {
                  key: q.key,
                  element,
                  body: q.body,
                  recommendation: null,
                  auto: true,
                  blank: q.blank,
                  saved: null,
                },
              ]
            : [];
        }),
      ]
    : [];
  const allViolations = rule.violations
    ? violations.flatMap((violation) => {
        const element = byId.get(violation.elementId);
        return element ? [{ violation, element }] : [];
      })
    : [];

  const businesses: (ElementSnapshot | null)[] = [
    ...active
      .filter((e) => e.kind === "business")
      .sort((a, b) => a.name.localeCompare(b.name, "ja")),
    null,
  ];
  return businesses
    .filter((b) => businessId === null || b?.id === businessId)
    .map((business): BoardGroup => {
      const inGroup = (element: ElementSnapshot) =>
        businessOf(element.id) === (business?.id ?? null);
      return {
        business,
        states: rule.states.map((state) => ({
          state,
          elements: active
            .filter((e) => e.reviewState === state && inGroup(e))
            .sort((a, b) => a.name.localeCompare(b.name, "ja")),
        })),
        questions: allQuestions.filter((q) => inGroup(q.element)),
        violations: allViolations.filter((v) => inGroup(v.element)),
      };
    })
    .filter(
      (g) =>
        g.states.some((s) => s.elements.length > 0) ||
        g.questions.length > 0 ||
        g.violations.length > 0,
    );
}
