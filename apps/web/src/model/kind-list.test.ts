import { ELEMENT_KINDS } from "@sujigaki/domain";
import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { defaultKind, kindCounts, kindListRows } from "./kind-list.ts";

const application = elementSnapshot("i1", "information", {
  name: "申込",
  summary: "受講者が出す申込の内容",
});
const course = elementSnapshot("i2", "information", { name: "講座" });
const invoice = elementSnapshot("i3", "information", {
  name: "Invoice",
});
const removed = elementSnapshot("i9", "information", {
  name: "古い申込",
  deletedAt: "2026-11-20T00:00:00.000Z",
});
const screen = elementSnapshot("s1", "screen", {
  name: "申込画面",
  relations: [relationTo(application, "screen"), relationTo(course, "screen")],
});
const elements = [application, course, invoice, removed, screen];

describe("#128 種類ごとの要素の一覧", () => {
  it("すべての種類を並べ、削除されていない要素を数える。要素のない種類は0にする", () => {
    const counts = kindCounts(elements);
    expect(counts.map((c) => c.kind)).toEqual([...ELEMENT_KINDS]);
    expect(counts.find((c) => c.kind === "information")).toEqual({
      kind: "information",
      label: "情報",
      count: 3,
    });
    expect(counts.find((c) => c.kind === "actor")?.count).toBe(0);
  });

  it("種類を選ばなければ、要素のある最初の種類にする。要素がなければ要求にする", () => {
    expect(defaultKind(elements)).toBe("screen");
    expect(defaultKind([application])).toBe("information");
    expect(defaultKind([])).toBe("requirement");
  });

  it("選んだ種類の要素を名前の順に並べ、つながっている要素を数える", () => {
    expect(
      kindListRows(elements, "information").map((r) => [
        r.element.name,
        r.connections,
      ]),
    ).toEqual([
      ["Invoice", 0],
      ["講座", 1],
      ["申込", 1],
    ]);
    expect(kindListRows(elements, "screen")[0]?.connections).toBe(2);
  });

  it("名前と要約で絞り込む。英字の大文字と小文字は区別せず、削除済みの要素は出さない", () => {
    expect(
      kindListRows(elements, "information", "受講者").map((r) => r.element.id),
    ).toEqual(["i1"]);
    expect(
      kindListRows(elements, "information", "invoice").map((r) => r.element.id),
    ).toEqual(["i3"]);
    expect(kindListRows(elements, "information", "古い")).toEqual([]);
  });
});
