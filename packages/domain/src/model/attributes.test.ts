import { describe, expect, it } from "vitest";
import { ATTRIBUTE_SCHEMAS, parseAttributes } from "./attributes.ts";
import { ELEMENT_KINDS } from "./element-kind.ts";

describe("種類ごとの属性", () => {
  it("すべての種類にスキーマがある", () => {
    for (const kind of ELEMENT_KINDS) {
      expect(ATTRIBUTE_SCHEMAS[kind]).toBeDefined();
    }
  });

  it("活動の業務手順の属性を受け付け、前後の空白を除く（FR-002）", () => {
    const result = parseAttributes("activity", {
      mode: "manual",
      exceptions: [" 必須項目の不足 "],
    });
    expect(result).toEqual({
      ok: true,
      value: { mode: "manual", exceptions: ["必須項目の不足"] },
    });
  });

  it("区分に決まった値以外を入れられない", () => {
    expect(parseAttributes("activity", { mode: "auto" })).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "「区分」の値が正しくありません。",
      },
    });
  });

  it("種類にない属性は受け付けない", () => {
    expect(parseAttributes("screen", { mode: "manual" })).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "この種類の要素には「mode」を持てません。",
      },
    });
  });

  it("情報の項目は名前が要る", () => {
    const result = parseAttributes("information", {
      items: [{ description: "x" }],
    });
    expect(result.ok === false && result.error.message).toBe(
      "「名前」の値が正しくありません。",
    );
  });

  it("属性がオブジェクトでなければ受け付けない", () => {
    expect(parseAttributes("activity", "手作業")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "「属性」の値が正しくありません。",
      },
    });
  });
});
