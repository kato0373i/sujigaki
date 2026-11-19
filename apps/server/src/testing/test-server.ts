import type { Role } from "@sujigaki/domain";
import { AT } from "@sujigaki/domain/testing";
import { createApp } from "../app.ts";
import type { ActorResolver } from "../auth/actor-resolver.ts";
import { REQUEST_HEADER } from "../http/csrf.ts";
import { MemoryProjectRepository } from "../repository/memory-project-repository.ts";

export const PROJECT_ID = "p1";
export const ROLE_HEADER = "X-Test-Role";

/** テスト用の操作した人。ロールはヘッダーで選び、利用者 ID はロールの名前にする */
const testActors: ActorResolver = {
  resolve: async (c) => {
    const role = (c.req.header(ROLE_HEADER) ?? "admin") as Role;
    return { userId: role, role };
  },
};

/** メモリのリポジトリに空のプロジェクトを1つ作った、テスト用のサーバー */
export async function testServer(options: { now?: () => Date } = {}) {
  const projects = new MemoryProjectRepository();
  await projects.create(PROJECT_ID, {
    name: "申込管理",
    systemName: "申込システム",
    summaryMaxLength: 100,
  });
  let sequence = 0;
  const app = createApp({
    projects,
    actors: testActors,
    now: options.now ?? (() => AT),
    newId: () => `id${String(++sequence).padStart(3, "0")}`,
  });

  /** API を呼ぶ。状態を変えるリクエストには CSRF のヘッダーを付ける */
  const call = async (
    method: string,
    path: string,
    options: { body?: unknown; role?: Role; version?: number } = {},
  ) => {
    const headers: Record<string, string> = {
      [REQUEST_HEADER]: "1",
      [ROLE_HEADER]: options.role ?? "admin",
    };
    if (options.body !== undefined)
      headers["Content-Type"] = "application/json";
    if (options.version !== undefined)
      headers["If-Match"] = `"${options.version}"`;
    const response = await app.request(`/api/projects/${PROJECT_ID}${path}`, {
      method,
      headers,
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      etag: response.headers.get("ETag"),
      body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
    };
  };

  return { app, projects, call };
}
