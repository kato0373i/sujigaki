import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ROLES } from "../access/role.ts";
import {
  availableReviewStates,
  checkReviewTransition,
  REVIEW_STATES,
} from "./review-state.ts";

const state = fc.constantFrom(...REVIEW_STATES);
const role = fc.constantFrom(...ROLES);

describe("FR-030 確認状態の遷移の性質", () => {
  it("画面に出す遷移先と、実際に遷移できる先が一致する", () => {
    fc.assert(
      fc.property(state, state, role, (from, to, r) => {
        const actor = { userId: "u1", role: r };
        const offered = availableReviewStates(from, actor).includes(to);
        expect(checkReviewTransition(from, to, actor).ok).toBe(offered);
      }),
    );
  });
});
