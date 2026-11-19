import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ELEMENT_KINDS } from "./element-kind.ts";
import { resolveRelation } from "./relation-rule.ts";

const kind = fc.constantFrom(...ELEMENT_KINDS);

describe("FR-001 つながりの規則の性質", () => {
  it("2つの種類をどちらの順で渡しても、つなげるかどうかは変わらない", () => {
    fc.assert(
      fc.property(kind, kind, (a, b) => {
        expect(resolveRelation(a, b).ok).toBe(resolveRelation(b, a).ok);
      }),
    );
  });

  it("つなげるときは、渡した2つの種類を結ぶつながりを返し、逆向きかどうかを正しく示す", () => {
    fc.assert(
      fc.property(kind, kind, (a, b) => {
        const result = resolveRelation(a, b);
        if (!result.ok) return;
        const { from, to } = result.type;
        expect([from, to].sort()).toEqual([a, b].sort());
        expect(result.reversed).toBe(from !== a);
      }),
    );
  });
});
