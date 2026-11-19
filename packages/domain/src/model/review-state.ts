import {
  type Actor,
  hasRoleAtLeast,
  ROLE_LABELS,
  type Role,
} from "../access/role.ts";
import { fail, ok, type Result } from "../shared/result.ts";

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
  readonly minimumRole: Role;
}

/**
 * 人が行う確認状態の遷移（要件定義書 7.1 節）。
 * 内容の編集で未レビューに戻る遷移は自動で行うため、ここには含めない。
 */
export const REVIEW_TRANSITIONS: readonly ReviewTransition[] = [
  { from: "unreviewed", to: "needs_check", minimumRole: "editor" },
  { from: "unreviewed", to: "approved", minimumRole: "owner" },
  { from: "needs_check", to: "approved", minimumRole: "owner" },
  { from: "unreviewed", to: "needs_fix", minimumRole: "editor" },
  { from: "needs_check", to: "needs_fix", minimumRole: "editor" },
  { from: "approved", to: "needs_check", minimumRole: "editor" },
];

/** actor が from から遷移できる確認状態を返す。画面のボタンの出し分けに使う（FR-030） */
export function availableReviewStates(
  from: ReviewState,
  actor: Actor,
): ReviewState[] {
  return REVIEW_TRANSITIONS.filter(
    (t) => t.from === from && hasRoleAtLeast(actor.role, t.minimumRole),
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
  if (!hasRoleAtLeast(actor.role, transition.minimumRole)) {
    return fail(
      "FORBIDDEN",
      `「${REVIEW_STATE_LABELS[to]}」にできるのは、${ROLE_LABELS[transition.minimumRole]}以上です。`,
    );
  }
  return ok(undefined);
}
