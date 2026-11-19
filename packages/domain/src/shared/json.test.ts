import { describe, expect, it } from "vitest";
import { jsonEqual } from "./json.ts";

describe("JSON の値の比較", () => {
  it("キーの順が違っても等しい", () => {
    expect(jsonEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
  });

  it("配列の順や値が違えば等しくない", () => {
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual({ a: null }, { a: "" })).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});
