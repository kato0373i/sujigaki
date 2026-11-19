import { Hono } from "hono";
import { ApiError } from "./http/problem.ts";

/** サーバーのログ。詳細はログにだけ残し、レスポンスには出さない（設計書 5.2 節の INTERNAL） */
export interface Logger {
  error(message: string, detail: unknown): void;
}

export interface AppOptions {
  readonly logger?: Logger;
}

const PROBLEM_TYPE = "application/problem+json";

/**
 * API のアプリを作る。サーバーモードの Lambda と、ローカルモードの CLI の両方で使う（ADR-003）。
 * 保存先などは、呼び出し側から渡す。
 */
export function createApp(options: AppOptions = {}) {
  const logger: Logger = options.logger ?? {
    error: (message, detail) => console.error(message, detail),
  };
  const app = new Hono();

  app.notFound(() => {
    throw new ApiError("NOT_FOUND", "API が見つかりません。");
  });

  app.onError((error) => {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(
            "INTERNAL",
            "予期しないエラーが起きました。時間をおいてもう一度試してください。",
          );
    if (!(error instanceof ApiError)) {
      logger.error("予期しないエラー", error);
    }
    const problem = apiError.toProblem();
    return new Response(JSON.stringify(problem), {
      status: problem.status,
      headers: { "Content-Type": PROBLEM_TYPE },
    });
  });

  return app;
}
