import { describe, expect, it } from "vitest";
import { isElementKind } from "./element-kind.ts";
import { RELATION_TYPES } from "./relation-type.ts";

describe("FR-001 つながりの種類", () => {
  it("関連データの33種類と、要求のつながり2種類がある", () => {
    expect(RELATION_TYPES.filter((type) => type.tag !== null)).toHaveLength(33);
    expect(RELATION_TYPES.filter((type) => type.tag === null)).toHaveLength(2);
  });

  it("識別子が重ならない", () => {
    const ids = RELATION_TYPES.map((type) => type.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("元と先が要素の種類になっている", () => {
    for (const type of RELATION_TYPES) {
      expect(isElementKind(type.from)).toBe(true);
      expect(isElementKind(type.to)).toBe(true);
    }
  });

  it("要求と業務のつながりは関連データに書き出さない", () => {
    const type = RELATION_TYPES.find((t) => t.id === "requirement-business");
    expect(type?.tag).toBeNull();
  });
});
