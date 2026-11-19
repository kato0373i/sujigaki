import { describe, expect, it } from "vitest";
import type { Actor } from "../access/role.ts";
import { Element, type ElementSnapshot, elementId } from "./element.ts";

const editor: Actor = { userId: "u1", role: "editor" };
const at = new Date("2026-11-19T00:00:00Z");
const later = new Date("2026-11-19T01:00:00Z");

function created(): Element {
  const result = Element.create(
    {
      id: elementId("e1"),
      kind: "activity",
      name: "申込内容を確認する",
      authorType: "human",
    },
    editor,
    at,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value.element;
}

function approved(): Element {
  const snapshot: ElementSnapshot = {
    ...created().toSnapshot(),
    reviewState: "approved",
  };
  return Element.fromSnapshot(snapshot);
}

describe("要素を作る", () => {
  it("未レビュー・バージョン1で作り、作成のイベントを出す", () => {
    const result = Element.create(
      {
        id: elementId("e1"),
        kind: "activity",
        name: "  申込内容を確認する ",
        authorType: "ai",
        source: "AI 提案",
      },
      editor,
      at,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snapshot = result.value.element.toSnapshot();
    expect(snapshot).toMatchObject({
      name: "申込内容を確認する",
      reviewState: "unreviewed",
      authorType: "ai",
      source: "AI 提案",
      version: 1,
      createdBy: "u1",
    });
    expect(result.value.events.map((e) => e.type)).toEqual(["ElementCreated"]);
  });

  it("名前が空なら作らない", () => {
    const result = Element.create(
      {
        id: elementId("e1"),
        kind: "activity",
        name: "  ",
        authorType: "human",
      },
      editor,
      at,
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "名前を入力してください。" },
    });
  });
});

describe("内容を編集する（FR-013）", () => {
  it("確認済みの要素を編集すると、未レビューに戻り、そのことをイベントに残す", () => {
    const result = approved().edit(
      { summary: "必須項目を確かめる" },
      editor,
      later,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { element, events } = result.value;
    expect(element.reviewState).toBe("unreviewed");
    expect(element.version).toBe(2);
    expect(events).toEqual([
      expect.objectContaining({ type: "ElementEdited", fields: ["summary"] }),
      expect.objectContaining({
        type: "ReviewStateChanged",
        from: "approved",
        to: "unreviewed",
        automatic: true,
      }),
    ]);
  });

  it("今と同じ値なら、変更として扱わない", () => {
    const element = approved();
    const result = element.edit(
      { name: "申込内容を確認する", attributes: {} },
      editor,
      later,
    );
    expect(result.ok && result.value.element).toBe(element);
    expect(result.ok && result.value.events).toEqual([]);
  });

  it("未レビューの要素を編集しても、状態のイベントは出さない", () => {
    const result = created().edit(
      { attributes: { exceptions: ["必須項目の不足"] } },
      editor,
      later,
    );
    expect(result.ok && result.value.events.map((e) => e.type)).toEqual([
      "ElementEdited",
    ]);
  });
});

describe("属性を検査する（設計書 ADR-005）", () => {
  it("種類に合わない属性では作らない", () => {
    const result = Element.create(
      {
        id: elementId("s1"),
        kind: "screen",
        name: "申込入力",
        attributes: { mode: "manual" },
        authorType: "human",
      },
      editor,
      at,
    );
    expect(result.ok === false && result.error.code).toBe("VALIDATION_FAILED");
  });

  it("正しくない属性では編集しない", () => {
    const result = created().edit(
      { attributes: { mode: "auto" } },
      editor,
      later,
    );
    expect(result.ok === false && result.error.message).toBe(
      "「区分」の値が正しくありません。",
    );
  });

  it("空白を除くと今と同じ値なら、変更として扱わない", () => {
    const first = created().edit(
      { attributes: { outcome: "承認済み" } },
      editor,
      later,
    );
    if (!first.ok) throw new Error(first.error.message);
    const element = first.value.element;
    const second = element.edit(
      { attributes: { outcome: " 承認済み " } },
      editor,
      later,
    );
    expect(second.ok && second.value.element).toBe(element);
  });
});

describe("外部リンクを変える", () => {
  it("確認状態は変えず、バージョンは上げる", () => {
    const result = approved().replaceLinks(
      [
        {
          id: "l1",
          kind: "manual",
          url: "https://example.com/manual",
          label: null,
        },
      ],
      editor,
      later,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.element.reviewState).toBe("approved");
    expect(result.value.element.version).toBe(2);
    expect(result.value.events.map((e) => e.type)).toEqual(["ElementEdited"]);
  });

  it("http(s) 以外の URL は受け付けない", () => {
    const result = created().replaceLinks(
      [{ id: "l1", kind: "manual", url: "javascript:alert(1)", label: null }],
      editor,
      later,
    );
    expect(result.ok).toBe(false);
  });
});
