import { describe, expect, it } from "vitest";
import { appWithTestRoutes, withHeader } from "../testing/test-app.ts";

describe("入力の検査", () => {
  it("形式に合わない本文は、項目ごとの理由を付けて VALIDATION_FAILED を返す", async () => {
    const response = await appWithTestRoutes().request("/api/test/elements", {
      method: "POST",
      headers: withHeader,
      body: JSON.stringify({ name: "", version: 1.5 }),
    });
    expect(response.status).toBe(400);
    const problem = (await response.json()) as {
      code: string;
      errors: unknown[];
    };
    expect(problem.code).toBe("VALIDATION_FAILED");
    expect(problem.errors).toEqual([
      { path: ["name"], message: expect.any(String) },
      { path: ["version"], message: expect.any(String) },
    ]);
  });

  it("JSON として読めない本文は VALIDATION_FAILED を返す", async () => {
    const response = await appWithTestRoutes().request("/api/test/elements", {
      method: "POST",
      headers: withHeader,
      body: "{",
    });
    expect(await response.json()).toMatchObject({
      code: "VALIDATION_FAILED",
      detail: "本文を JSON として読めません。",
    });
  });

  it("形式に合う本文は、そのまま受け取る", async () => {
    const response = await appWithTestRoutes().request("/api/test/elements", {
      method: "POST",
      headers: withHeader,
      body: JSON.stringify({ name: "申込", version: 1 }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "申込", version: 1 });
  });
});
