import { describe, expect, it } from "vitest";
import type { Actor } from "../access/role.ts";
import {
  availableReviewStates,
  checkReviewTransition,
} from "./review-state.ts";

const editor: Actor = { userId: "u1", role: "editor" };
const owner: Actor = { userId: "u2", role: "owner" };

describe("FR-030 確認状態の遷移", () => {
  it("業務責任者は要確認を確認済みにできる", () => {
    expect(checkReviewTransition("needs_check", "approved", owner).ok).toBe(
      true,
    );
  });

  it("編集者は確認済みにできない", () => {
    expect(checkReviewTransition("needs_check", "approved", editor)).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "「確認済み」にできるのは、業務責任者以上です。",
      },
    });
  });

  it("定義にない遷移はできない", () => {
    const result = checkReviewTransition("needs_fix", "approved", owner);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TRANSITION");
  });

  it("ロールに応じて、遷移できる状態を返す", () => {
    expect(availableReviewStates("unreviewed", editor)).toEqual([
      "needs_check",
      "needs_fix",
    ]);
    expect(availableReviewStates("unreviewed", owner)).toEqual([
      "needs_check",
      "approved",
      "needs_fix",
    ]);
  });
});
