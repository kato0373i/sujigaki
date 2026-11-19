import type { Actor } from "@sujigaki/domain";

/** 変更の取り出しの応答（設計書 5.1 節）。前後の内容は含まない */
export interface ChangesResponse {
  readonly revision: number;
  readonly operations: readonly {
    readonly type: string;
    readonly actorId: string | null;
    readonly revision: number;
  }[];
}

/** ヘッダーに出す更新の通知（FR-071）。件数が分からないときは count を null にする */
export type UpdateNotice = { readonly count: number | null } | null;

/**
 * 読み込んだリビジョンより後の操作から、知らせる更新を求める（画面設計書 4章）。
 * 自分の操作は数えない。ローカルモードの外の変更（ExternalChange）は、操作した人がいなくても数える。
 * 今のリビジョンが読み込んだものより小さければ、サーバーを起動し直したとみなし、件数を出さずに知らせる
 */
export function updateNotice(
  known: number,
  changes: ChangesResponse,
  me: Actor,
): UpdateNotice {
  if (changes.revision < known) return { count: null };
  const count = changes.operations.filter(
    (o) =>
      o.revision > known &&
      (o.type === "ExternalChange" || o.actorId !== me.userId),
  ).length;
  return count > 0 ? { count } : null;
}
