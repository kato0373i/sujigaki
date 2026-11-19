/**
 * テストで使う作成関数（テスト戦略 3.1 節）。各テストには、確かめたい項目だけを書けるようにする。
 * ほかのパッケージのテストからは `@sujigaki/domain/testing` で読み込む。
 */
import type { Actor, Role } from "../access/role.ts";
import type { QuestionSnapshot } from "../deliberation/question.ts";
import { questionId } from "../deliberation/question.ts";
import {
  type ElementSnapshot,
  elementId,
  type Relation,
  relationId,
} from "../model/element.ts";
import type { ElementKind } from "../model/element-kind.ts";
import type { Result } from "../shared/result.ts";

export const AT = new Date("2026-11-19T00:00:00Z");

/** ロールごとの操作した人。利用者 ID はロールの名前にする */
export const ACTORS: Readonly<Record<Role, Actor>> = {
  viewer: { userId: "viewer", role: "viewer" },
  editor: { userId: "editor", role: "editor" },
  owner: { userId: "owner", role: "owner" },
  admin: { userId: "admin", role: "admin" },
};

/** ローカルモードの操作した人。ログインしないため userId は null */
export const LOCAL_ACTOR: Actor = { userId: null, role: "admin" };

/** 成功の値を取り出す。失敗ならメッセージ付きで投げ、テストを失敗させる */
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

export function elementSnapshot(
  id: string,
  kind: ElementKind,
  overrides: Partial<ElementSnapshot> = {},
): ElementSnapshot {
  const at = AT.toISOString();
  return {
    id: elementId(id),
    kind,
    name: id,
    summary: "",
    attributes: {},
    reviewState: "unreviewed",
    authorType: "human",
    source: null,
    version: 1,
    deletedAt: null,
    deletedBy: null,
    links: [],
    relations: [],
    createdAt: at,
    createdBy: null,
    updatedAt: at,
    updatedBy: null,
    ...overrides,
  };
}

/** target へのつながり。ID は `r-<先の要素の ID>` にする */
export function relationTo(
  target: Pick<ElementSnapshot, "id" | "kind">,
  from?: ElementKind,
): Relation {
  return {
    id: relationId(`r-${target.id}`),
    typeId: from ? `${from}-${target.kind}` : "",
    to: target.id,
    toKind: target.kind,
  };
}

export function questionSnapshot(
  elementIdValue: string,
  overrides: Partial<QuestionSnapshot> = {},
): QuestionSnapshot {
  return {
    id: questionId(`q-${elementIdValue}`),
    elementId: elementId(elementIdValue),
    body: "担当者は誰ですか",
    recommendation: null,
    state: "open",
    answer: null,
    answeredBy: null,
    answeredAt: null,
    authorType: "auto",
    createdAt: AT.toISOString(),
    createdBy: null,
    ...overrides,
  };
}
