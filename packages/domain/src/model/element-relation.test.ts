import { describe, expect, it } from "vitest";
import type { Actor } from "../access/role.ts";
import { Element, elementId, relationId } from "./element.ts";

const editor: Actor = { userId: "u1", role: "editor" };
const at = new Date("2026-11-19T00:00:00Z");

function approvedActivity(): Element {
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
  return Element.fromSnapshot({
    ...result.value.element.toSnapshot(),
    reviewState: "approved",
  });
}

const usecase = { id: elementId("u1"), kind: "usecase" } as const;

describe("つながりを追加する", () => {
  it("元の要素を未レビューに戻す（FR-013）", () => {
    const result = approvedActivity().addRelation(
      relationId("r1"),
      usecase,
      editor,
      at,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.element.relations).toEqual([
      { id: "r1", typeId: "activity-usecase", to: "u1", toKind: "usecase" },
    ]);
    expect(result.value.element.reviewState).toBe("unreviewed");
    expect(result.value.events.map((e) => e.type)).toEqual([
      "RelationAdded",
      "ReviewStateChanged",
    ]);
  });

  it("同じつながりは2つ作れない", () => {
    const first = approvedActivity().addRelation(
      relationId("r1"),
      usecase,
      editor,
      at,
    );
    if (!first.ok) throw new Error();
    const second = first.value.element.addRelation(
      relationId("r2"),
      usecase,
      editor,
      at,
    );
    expect(second.ok === false && second.error.code).toBe("RELATION_EXISTS");
  });

  it("定義されていない組は作れない（FR-001）", () => {
    const result = approvedActivity().addRelation(
      relationId("r1"),
      { id: elementId("q1"), kind: "requirement" },
      editor,
      at,
    );
    expect(result.ok === false && result.error.code).toBe(
      "RELATION_NOT_ALLOWED",
    );
  });

  it("元でない側からは作れず、どちらからつなぐかを返す", () => {
    const created = Element.create(
      {
        id: elementId("u1"),
        kind: "usecase",
        name: "申込を承認する",
        authorType: "human",
      },
      editor,
      at,
    );
    if (!created.ok) throw new Error();
    const result = created.value.element.addRelation(
      relationId("r1"),
      { id: elementId("a1"), kind: "activity" },
      editor,
      at,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "RELATION_NOT_ALLOWED",
        message:
          "このつながりは「活動」の側で持ちます。「活動」の要素からつないでください。",
      },
    });
  });
});

describe("つながりを削除する", () => {
  it("元の要素を未レビューに戻す（FR-013）", () => {
    const added = approvedActivity().addRelation(
      relationId("r1"),
      usecase,
      editor,
      at,
    );
    if (!added.ok) throw new Error();
    const approvedAgain = Element.fromSnapshot({
      ...added.value.element.toSnapshot(),
      reviewState: "approved",
    });
    const result = approvedAgain.removeRelation(relationId("r1"), editor, at);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.element.relations).toEqual([]);
    expect(result.value.element.reviewState).toBe("unreviewed");
  });

  it("ないつながりは削除できない", () => {
    const result = approvedActivity().removeRelation(
      relationId("none"),
      editor,
      at,
    );
    expect(result.ok === false && result.error.code).toBe("NOT_FOUND");
  });
});
