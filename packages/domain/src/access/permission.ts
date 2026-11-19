import { fail, ok, type Result } from "../shared/result.ts";
import { type Actor, hasRoleAtLeast, ROLE_LABELS, type Role } from "./role.ts";

/**
 * 操作ごとに必要な最低限のロール（要件定義書 FR-081 の表）。
 * 権限の判定はこの表だけを見る。画面のボタンの出し分けにも使う。
 */
export const PERMISSIONS = {
  /** 閲覧・表示の切り替え・書き出し */
  view: "viewer",
  /** コメントを書く */
  writeComment: "viewer",
  /** 問いに回答する */
  answerQuestion: "viewer",
  /** 要素の作成・編集・削除・復元、AI 提案と読み込みの採否 */
  editElement: "editor",
  /** 問いの解決と取り下げ、ほかの人の回答の取り消し（要件定義書 7.2 節） */
  manageQuestion: "editor",
  /** 確認状態を「要確認」「要修正」にする */
  flagReview: "editor",
  /** 確認状態を「確認済み」にする */
  approveReview: "owner",
  /** 決定を記録する */
  recordDecision: "owner",
  /** 確認状態を保ったまま復元する（FR-050） */
  restoreWithReviewState: "owner",
  /** 要素の完全な削除 */
  purgeElement: "admin",
  /** メンバーとロールの管理 */
  manageMembers: "admin",
  /** プロジェクトの設定 */
  configureProject: "admin",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof PERMISSIONS;

/** actor が permission の操作をできるかを返す */
export function can(actor: Actor, permission: Permission): boolean {
  return hasRoleAtLeast(actor.role, PERMISSIONS[permission]);
}

/**
 * actor が permission の操作をできなければ FORBIDDEN を返す。
 * subject は「決定を記録できる」のように、メッセージの「のは」の前に入る語句
 */
export function checkPermission(
  actor: Actor,
  permission: Permission,
  subject: string,
): Result<void> {
  if (can(actor, permission)) return ok(undefined);
  const label = ROLE_LABELS[PERMISSIONS[permission]];
  return fail("FORBIDDEN", `${subject}のは、${label}以上です。`);
}
