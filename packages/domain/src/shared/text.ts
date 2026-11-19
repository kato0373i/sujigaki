import { fail, ok, type Result } from "./result.ts";

/** 前後の空白を除き、空なら「〜を入力してください。」の失敗を返す */
export function requiredText(value: string, label: string): Result<string> {
  const trimmed = value.trim();
  if (trimmed.length === 0)
    return fail("VALIDATION_FAILED", `${label}を入力してください。`);
  return ok(trimmed);
}
