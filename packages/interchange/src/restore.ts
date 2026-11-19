import { type Actor, can } from "@sujigaki/domain";
import type { ProjectDocument } from "./document.ts";

/**
 * 空のプロジェクトに復元する内容を返す（FR-050）。
 * 業務責任者以上は確認状態を保ち、編集者はすべての要素を未レビューにする。
 * ローカルモードは管理者として扱うため、確認状態を保つ。
 * 空のプロジェクトかどうかは、呼び出し側が確かめる（設計書 5.2 節の PROJECT_NOT_EMPTY）。
 */
export function restoreDocument(
  document: ProjectDocument,
  actor: Actor,
): ProjectDocument {
  if (can(actor, "restoreWithReviewState")) return document;
  return {
    ...document,
    elements: document.elements.map((e) => ({
      ...e,
      reviewState: "unreviewed",
    })),
  };
}
