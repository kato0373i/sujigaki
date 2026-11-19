import { fail } from "@sujigaki/domain";
import { z } from "zod";
import { createApp, type Logger } from "../app.ts";
import { readBody, unwrapOrThrow } from "../http/validation.ts";

/** 共通の処理を確かめるための、テスト用のルートを足したアプリ */
export function appWithTestRoutes(logger?: Logger) {
  const app = createApp(logger ? { logger } : {});
  app.get("/api/test/last-admin", () =>
    unwrapOrThrow(fail("LAST_ADMIN", "管理者が1人以上必要です。")),
  );
  app.get("/api/test/crash", () => {
    throw new Error("接続文字列 postgres://secret");
  });
  app.post("/api/test/elements", async (c) => {
    const body = await readBody(
      c,
      z.strictObject({ name: z.string().min(1), version: z.number().int() }),
    );
    return c.json(body);
  });
  app.post("/auth/logout", (c) => c.body(null, 204));
  return app;
}

export const withHeader = {
  "X-Sujigaki-Request": "1",
  "Content-Type": "application/json",
};
