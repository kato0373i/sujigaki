import { elementSnapshot } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { searchElements } from "./element-search.ts";

const apply = elementSnapshot("a1", "activity", { name: "申込を受け付ける" });
const screen = elementSnapshot("s1", "screen", {
  name: "入力画面",
  summary: "申込の内容を入れる",
});
const api = elementSnapshot("u1", "usecase", { name: "API で申込を登録する" });
const removed = elementSnapshot("a9", "activity", {
  name: "申込を取り消す",
  deletedAt: "2026-11-20T00:00:00.000Z",
});
const elements = [screen, apply, api, removed];

describe("FR-026 要素の検索", () => {
  it("名前に当てはまる要素を先に、要約だけに当てはまる要素を後に並べる", () => {
    expect(
      searchElements(elements, " 申込 ").map((h) => [
        h.kindLabel,
        h.element.name,
        h.inName,
      ]),
    ).toEqual([
      ["システム操作", "API で申込を登録する", true],
      ["活動", "申込を受け付ける", true],
      ["画面", "入力画面", false],
    ]);
  });

  it("英字の大文字と小文字は区別しない", () => {
    expect(searchElements(elements, "api").map((h) => h.element.id)).toEqual([
      "u1",
    ]);
  });

  it("削除済みの要素と、当てはまらない要素は出さない", () => {
    expect(searchElements(elements, "取り消す")).toEqual([]);
    expect(searchElements(elements, "返金")).toEqual([]);
  });

  it("空の検索語では何も出さず、件数の上限で切る", () => {
    expect(searchElements(elements, "  ")).toEqual([]);
    expect(searchElements(elements, "申込", 1)).toHaveLength(1);
  });
});
