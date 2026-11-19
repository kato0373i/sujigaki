import { describe, expect, it, vi } from "vitest";
import { type ApiErrorCode, PROBLEMS } from "./http/problem.ts";
import { appWithTestRoutes } from "./testing/test-app.ts";

describe("API のエラー（設計書 5.2 節）", () => {
  it("ドメインのエラーを、対応する状態と problem+json で返す", async () => {
    const response = await appWithTestRoutes().request("/api/test/last-admin");
    expect(response.status).toBe(409);
    expect(response.headers.get("Content-Type")).toBe(
      "application/problem+json",
    );
    expect(await response.json()).toEqual({
      type: "urn:sujigaki:problem:last-admin",
      title: "管理者が1人以上必要です",
      status: 409,
      code: "LAST_ADMIN",
      detail: "管理者が1人以上必要です。",
    });
  });

  it("エラーコードと状態の対応が、設計書の表と同じ", () => {
    const expected: Record<ApiErrorCode, number> = {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      VALIDATION_FAILED: 400,
      RELATION_NOT_ALLOWED: 422,
      INVALID_TRANSITION: 422,
      RELATION_EXISTS: 409,
      ELEMENT_DELETED: 409,
      LAST_ADMIN: 409,
      PROJECT_NOT_EMPTY: 409,
      VERSION_CONFLICT: 412,
      INTERNAL: 500,
    };
    const actual = Object.fromEntries(
      Object.entries(PROBLEMS).map(([code, p]) => [code, p.status]),
    );
    expect(actual).toEqual(expected);
  });

  it("ない API には NOT_FOUND を返す", async () => {
    const response = await appWithTestRoutes().request("/api/nothing");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("予期しないエラーは、詳細をログにだけ残して INTERNAL を返す", async () => {
    const logger = { error: vi.fn() };
    const response = await appWithTestRoutes(logger).request("/api/test/crash");
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain('"code":"INTERNAL"');
    expect(body).not.toContain("secret");
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
