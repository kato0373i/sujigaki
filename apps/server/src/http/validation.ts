import type { Result } from "@sujigaki/domain";
import type { Context } from "hono";
import { z } from "zod";
import { ApiError } from "./problem.ts";

/** リクエストの本文を JSON として読み、スキーマに合わなければ VALIDATION_FAILED を投げる */
export async function readBody<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError("VALIDATION_FAILED", "本文を JSON として読めません。");
  }
  const parsed = schema.safeParse(body, {
    error: z.locales.ja().localeError,
  });
  if (!parsed.success) {
    throw new ApiError("VALIDATION_FAILED", "入力の形式が正しくありません。", {
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.filter(
          (p): p is string | number => typeof p !== "symbol",
        ),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

/** ドメインの操作の結果から値を取り出す。失敗なら、対応する API のエラーを投げる */
export function unwrapOrThrow<T>(result: Result<T>): T {
  if (!result.ok) throw ApiError.fromDomain(result.error);
  return result.value;
}
