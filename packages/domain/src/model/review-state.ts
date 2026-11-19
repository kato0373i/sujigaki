import { can, checkPermission, type Permission } from "../access/permission.ts";
import type { Actor } from "../access/role.ts";
import { fail, type Result } from "../shared/result.ts";

export const REVIEW_STATES = [
  "unreviewed",
  "needs_check",
  "needs_fix",
  "approved",
] as const;

export type ReviewState = (typeof REVIEW_STATES)[number];

export const REVIEW_STATE_LABELS: Readonly<Record<ReviewState, string>> = {
  unreviewed: "未レビュー",
  needs_check: "要確認",
  needs_fix: "要修正",
  approved: "確認済み",
};

interface ReviewTransition {
  readonly from: ReviewState;
  readonly to: ReviewState;
  readonly permission: Extract<Permission, "flagReview" | "approveReview">;
}

/**
 * 人が行う確認状態の遷移（要件定義書 7.1 節）。
 * 内容の編集で未レビューに戻る遷移は自動で行うため、ここには含めない。
 */
export const REVIEW_TRANSITIONS: readonly ReviewTransition[] = [
  { from: "unreviewed", to: "needs_check", permission: "flagReview" },
  { from: "unreviewed", to: "approved", permission: "approveReview" },
  { from: "needs_check", to: "approved", permission: "approveReview" },
  { from: "unreviewed", to: "needs_fix", permission: "flagReview" },
  { from: "needs_check", to: "needs_fix", permission: "flagReview" },
  { from: "approved", to: "needs_check", permission: "flagReview" },
];

/** actor が from から遷移できる確認状態を返す。画面のボタンの出し分けに使う（FR-030） */
export function availableReviewStates(
  from: ReviewState,
  actor: Actor,
): ReviewState[] {
  return REVIEW_TRANSITIONS.filter(
    (t) => t.from === from && can(actor, t.permission),
  ).map((t) => t.to);
}

export function checkReviewTransition(
  from: ReviewState,
  to: ReviewState,
  actor: Actor,
): Result<void> {
  const transition = REVIEW_TRANSITIONS.find(
    (t) => t.from === from && t.to === to,
  );
  if (!transition) {
    return fail(
      "INVALID_TRANSITION",
      `「${REVIEW_STATE_LABELS[from]}」から「${REVIEW_STATE_LABELS[to]}」には変えられません。`,
    );
  }
  return checkPermission(
    actor,
    transition.permission,
    `「${REVIEW_STATE_LABELS[to]}」にできる`,
  );
}
