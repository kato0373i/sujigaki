import type { MiddlewareHandler } from "hono";
import { ApiError } from "./problem.ts";

export const REQUEST_HEADER = "X-Sujigaki-Request";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 状態を変えるリクエストに `X-Sujigaki-Request: 1` を求める（設計書 5.1 節）。
 * ほかのサイトのフォームからは独自のヘッダーを付けられないため、Cookie の SameSite=Lax と合わせて CSRF を防ぐ。
 */
export const requireRequestHeader: MiddlewareHandler = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method) && c.req.header(REQUEST_HEADER) !== "1") {
    throw new ApiError(
      "FORBIDDEN",
      `状態を変えるリクエストには、${REQUEST_HEADER} ヘッダーが必要です。`,
    );
  }
  await next();
};
