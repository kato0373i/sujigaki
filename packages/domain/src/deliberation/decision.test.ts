import { describe, expect, it } from "vitest";
import type { Actor } from "../access/role.ts";
import { elementId } from "../model/element.ts";
import { Decision, decisionId, type NewDecision } from "./decision.ts";

const editor: Actor = { userId: "e1", role: "editor" };
const owner: Actor = { userId: "o1", role: "owner" };
const at = new Date("2026-11-19T00:00:00Z");

const input: NewDecision = {
  id: decisionId("d1"),
  topic: "受講案内を誰が送るか",
  conclusion: "研修担当が送る",
  reason: "定員の確定と同じ人が送ると、送り漏れに気づきやすい",
  elementIds: [elementId("a3"), elementId("a4"), elementId("a3")],
};

describe("決定を記録する（FR-032）", () => {
  it("業務責任者は記録でき、要素の重なりは除く", () => {
    const result = Decision.record(input, owner, at);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.decision.toSnapshot()).toMatchObject({
      conclusion: "研修担当が送る",
      elementIds: ["a3", "a4"],
      decidedBy: "o1",
    });
    expect(result.value.events.map((e) => e.type)).toEqual([
      "DecisionRecorded",
    ]);
  });

  it("編集者は記録できない（FR-081）", () => {
    const result = Decision.record(input, editor, at);
    expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
  });

  it("理由が空なら記録しない", () => {
    const result = Decision.record({ ...input, reason: " " }, owner, at);
    expect(result.ok === false && result.error.message).toBe(
      "理由を入力してください。",
    );
  });

  it("関係する要素がなければ記録しない", () => {
    const result = Decision.record({ ...input, elementIds: [] }, owner, at);
    expect(result.ok).toBe(false);
  });
});
