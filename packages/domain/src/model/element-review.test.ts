import { describe, expect, it } from "vitest";
import type { Actor } from "../access/role.ts";
import { Element, elementId } from "./element.ts";

const editor: Actor = { userId: "u1", role: "editor" };
const owner: Actor = { userId: "u2", role: "owner" };
const at = new Date("2026-11-19T00:00:00Z");

function activity(): Element {
  const result = Element.create(
    {
      id: elementId("a1"),
      kind: "activity",
      name: "申込を承認する",
      authorType: "human",
    },
    editor,
    at,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value.element;
}

describe("FR-030 確認状態を変える", () => {
  it("確認を依頼し、業務責任者が確認済みにする", () => {
    const requested = activity().changeReviewState("needs_check", editor, at);
    if (!requested.ok) throw new Error(requested.error.message);
    const result = requested.value.element.changeReviewState(
      "approved",
      owner,
      at,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.element.reviewState).toBe("approved");
    expect(result.value.element.version).toBe(3);
    expect(result.value.events).toEqual([
      expect.objectContaining({
        type: "ReviewStateChanged",
        from: "needs_check",
        to: "approved",
        automatic: false,
        actorId: "u2",
      }),
    ]);
  });

  it("編集者は確認済みにできない", () => {
    const result = activity().changeReviewState("approved", editor, at);
    expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
  });
});
