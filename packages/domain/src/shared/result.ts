/** ドメインの操作の結果。失敗は例外にせず、コードと利用者向けのメッセージで返す */
export type DomainErrorCode =
  | "VALIDATION_FAILED"
  | "FORBIDDEN"
  | "INVALID_TRANSITION"
  | "RELATION_NOT_ALLOWED"
  | "RELATION_EXISTS"
  | "NOT_FOUND"
  | "ELEMENT_DELETED";

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(
  code: DomainErrorCode,
  message: string,
): Result<T> {
  return { ok: false, error: { code, message } };
}
