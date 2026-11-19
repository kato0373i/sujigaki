import type { Actor } from "@sujigaki/domain";
import type { Context } from "hono";

/**
 * リクエストから、操作した人とプロジェクトでのロールを決める。
 * ログインしていなければ UNAUTHENTICATED を、メンバーでないプロジェクトなら NOT_FOUND を投げる（設計書 5.2 節）
 */
export interface ActorResolver {
  resolve(c: Context, projectId: string): Promise<Actor>;
}

/** ローカルモードの操作した人。ログインせず、常に管理者として扱う（設計書 5章） */
export const localActorResolver: ActorResolver = {
  resolve: async () => ({ userId: null, role: "admin" }),
};
