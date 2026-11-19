import { describe, expect, it } from "vitest";
import {
  ELEMENT_KIND_LABELS,
  ELEMENT_KINDS,
  isElementKind,
} from "./element-kind.ts";

describe("要素の種類", () => {
  it("18種類ある", () => {
    expect(ELEMENT_KINDS).toHaveLength(18);
    expect(new Set(ELEMENT_KINDS).size).toBe(18);
  });

  it("すべての種類に表示名がある", () => {
    for (const kind of ELEMENT_KINDS) {
      expect(ELEMENT_KIND_LABELS[kind]).not.toBe("");
    }
  });

  it("表示名に RDRA の用語を使わない", () => {
    const labels = Object.values(ELEMENT_KIND_LABELS);
    for (const term of [
      "アクター",
      "BUC",
      "アクティビティ",
      "UC",
      "コンテキスト",
      "条件",
      "バリエーション",
      "タイマー",
    ]) {
      expect(labels.some((label) => label.includes(term))).toBe(false);
    }
  });

  it("文字列が種類の識別子かを判定する", () => {
    expect(isElementKind("activity")).toBe(true);
    expect(isElementKind("attribute")).toBe(false);
  });
});
