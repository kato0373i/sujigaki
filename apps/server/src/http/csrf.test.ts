import { describe, expect, it } from "vitest";
import { appWithTestRoutes } from "../testing/test-app.ts";
import { REQUEST_HEADER } from "./csrf.ts";

describe("CSRF 対策（設計書 5.1 節）", () => {
  it("状態を変えるリクエストに専用のヘッダーがなければ、拒否する", async () => {
    const app = appWithTestRoutes();
    for (const path of ["/api/test/elements", "/auth/logout"]) {
      const response = await app.request(path, { method: "POST" });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        code: "FORBIDDEN",
        detail: `状態を変えるリクエストには、${REQUEST_HEADER} ヘッダーが必要です。`,
      });
    }
  });

  it("ヘッダーの値が 1 でなければ、拒否する", async () => {
    const response = await appWithTestRoutes().request("/auth/logout", {
      method: "POST",
      headers: { [REQUEST_HEADER]: "true" },
    });
    expect(response.status).toBe(403);
  });

  it("読み取るだけのリクエストには、ヘッダーを求めない", async () => {
    const response = await appWithTestRoutes().request("/api/test/last-admin");
    expect(response.status).toBe(409);
  });

  it("ヘッダーがあれば通す", async () => {
    const response = await appWithTestRoutes().request("/auth/logout", {
      method: "POST",
      headers: { [REQUEST_HEADER]: "1" },
    });
    expect(response.status).toBe(204);
  });
});
