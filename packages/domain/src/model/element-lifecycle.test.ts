import { describe, expect, it } from "vitest";
import type { Actor } from "../access/role.ts";
import { Element, elementId, relationId } from "./element.ts";

const editor: Actor = { userId: "u1", role: "editor" };
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

function approvedActivityConnectedTo(target: string): Element {
  const added = activity().addRelation(
    relationId("r1"),
    { id: elementId(target), kind: "usecase" },
    editor,
    at,
  );
  if (!added.ok) throw new Error(added.error.message);
  return Element.fromSnapshot({
    ...added.value.element.toSnapshot(),
    reviewState: "approved",
  });
}

describe("削除と復元（FR-012）", () => {
  it("削除済みにし、復元で戻す", () => {
    const deleted = activity().delete(editor, at);
    if (!deleted.ok) throw new Error();
    expect(deleted.value.element.isDeleted).toBe(true);
    expect(deleted.value.element.toSnapshot().deletedBy).toBe("u1");
    expect(deleted.value.events.map((e) => e.type)).toEqual(["ElementDeleted"]);

    const restored = deleted.value.element.restore(editor, at);
    if (!restored.ok) throw new Error();
    expect(restored.value.element.isDeleted).toBe(false);
    expect(restored.value.events.map((e) => e.type)).toEqual([
      "ElementRestored",
    ]);
  });

  it("削除済みの要素は編集できない", () => {
    const deleted = activity().delete(editor, at);
    if (!deleted.ok) throw new Error();
    const result = deleted.value.element.edit({ name: "別の名前" }, editor, at);
    expect(result.ok === false && result.error.code).toBe("ELEMENT_DELETED");
  });

  it("削除してもつながりのデータは残す", () => {
    const deleted = approvedActivityConnectedTo("u1").delete(editor, at);
    if (!deleted.ok) throw new Error();
    expect(deleted.value.element.relations).toHaveLength(1);
  });
});

describe("つながりの先が削除されたとき（FR-013）", () => {
  it("そのつながりを持つ元の要素を未レビューに戻す", () => {
    const { element, events } = approvedActivityConnectedTo(
      "u1",
    ).resetForChangedTarget(elementId("u1"), editor, at);
    expect(element.reviewState).toBe("unreviewed");
    expect(events).toEqual([
      expect.objectContaining({
        type: "ReviewStateChanged",
        from: "approved",
        automatic: true,
      }),
    ]);
  });

  it("関係のない要素の削除では変えない", () => {
    const element = approvedActivityConnectedTo("u1");
    const change = element.resetForChangedTarget(
      elementId("other"),
      editor,
      at,
    );
    expect(change.element).toBe(element);
    expect(change.events).toEqual([]);
  });
});

describe("削除済みの要素", () => {
  function deleted(): Element {
    const result = approvedActivityConnectedTo("u1").delete(editor, at);
    if (!result.ok) throw new Error(result.error.message);
    return result.value.element;
  }

  it("内容・外部リンク・つながり・確認状態のどれも変えられない", () => {
    const element = deleted();
    const results = [
      element.edit({ name: "別の名前" }, editor, at),
      element.replaceLinks([], editor, at),
      element.addRelation(
        relationId("r2"),
        { id: elementId("s1"), kind: "screen" },
        editor,
        at,
      ),
      element.removeRelation(relationId("r1"), editor, at),
      element.changeReviewState("needs_check", editor, at),
    ];
    for (const result of results) {
      expect(result).toEqual({
        ok: false,
        error: {
          code: "ELEMENT_DELETED",
          message:
            "削除済みの要素は編集できません。復元してから編集してください。",
        },
      });
    }
  });

  it("もう一度削除しても、何も変えない", () => {
    const element = deleted();
    const again = element.delete(editor, at);
    expect(again).toMatchObject({ ok: true, value: { events: [] } });
    if (again.ok) expect(again.value.element.version).toBe(element.version);
  });

  it("削除していない要素を復元しても、何も変えない", () => {
    const result = activity().restore(editor, at);
    expect(result).toMatchObject({ ok: true, value: { events: [] } });
  });
});
