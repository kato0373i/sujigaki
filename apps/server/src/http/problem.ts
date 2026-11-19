import type { DomainError, DomainErrorCode } from "@sujigaki/domain";

/** API のエラーコード（設計書 5.2 節）。ドメインのエラーコードに、API だけのコードを加えたもの */
export type ApiErrorCode =
  | DomainErrorCode
  | "UNAUTHENTICATED"
  | "PROJECT_NOT_EMPTY"
  | "INTERNAL";

interface ProblemDefinition {
  readonly status: 400 | 401 | 403 | 404 | 409 | 412 | 422 | 500;
  readonly title: string;
}

export const PROBLEMS: Readonly<Record<ApiErrorCode, ProblemDefinition>> = {
  UNAUTHENTICATED: { status: 401, title: "ログインが必要です" },
  FORBIDDEN: { status: 403, title: "この操作の権限がありません" },
  NOT_FOUND: { status: 404, title: "見つかりません" },
  VALIDATION_FAILED: { status: 400, title: "入力の形式が正しくありません" },
  RELATION_NOT_ALLOWED: { status: 422, title: "この組み合わせはつなげません" },
  INVALID_TRANSITION: { status: 422, title: "この状態には変えられません" },
  RELATION_EXISTS: { status: 409, title: "同じつながりがすでにあります" },
  ELEMENT_DELETED: { status: 409, title: "削除済みの要素です" },
  LAST_ADMIN: { status: 409, title: "管理者が1人以上必要です" },
  PROJECT_NOT_EMPTY: { status: 409, title: "プロジェクトに要素があります" },
  VERSION_CONFLICT: { status: 412, title: "ほかの人が先に更新しました" },
  INTERNAL: { status: 500, title: "サーバーでエラーが起きました" },
};

/** 項目ごとの入力の誤り。VALIDATION_FAILED の `errors` に入れる */
export interface FieldError {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/** RFC 9457 の問題の詳細 */
export interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly detail: string;
  readonly errors?: readonly FieldError[];
  readonly current?: unknown;
}

/** API のエラー。ルートの中で投げると、problem+json のレスポンスになる */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly extra: Pick<Problem, "errors" | "current">;

  constructor(
    code: ApiErrorCode,
    detail: string,
    extra: Pick<Problem, "errors" | "current"> = {},
  ) {
    super(detail);
    this.name = "ApiError";
    this.code = code;
    this.extra = extra;
  }

  static fromDomain(error: DomainError): ApiError {
    return new ApiError(error.code, error.message);
  }

  toProblem(): Problem {
    const definition = PROBLEMS[this.code];
    return {
      type: `urn:sujigaki:problem:${this.code.toLowerCase().replaceAll("_", "-")}`,
      title: definition.title,
      status: definition.status,
      code: this.code,
      detail: this.message,
      ...this.extra,
    };
  }
}
