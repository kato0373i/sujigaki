import { describe, expect, it } from "vitest";
import { connectableKinds, resolveRelation } from "./relation-rule.ts";

describe("つながりの種類を求める", () => {
  it("定義どおりの順で渡すと、そのまま見つかる", () => {
    const result = resolveRelation("activity", "usecase");
    expect(result).toMatchObject({
      ok: true,
      type: { id: "activity-usecase" },
      reversed: false,
    });
  });

  it("逆の順で渡しても見つかり、逆であることがわかる", () => {
    const result = resolveRelation("usecase", "activity");
    expect(result).toMatchObject({
      ok: true,
      type: { id: "activity-usecase" },
      reversed: true,
    });
  });

  it("同じ種類どうしのつながりは逆にしない", () => {
    expect(resolveRelation("information", "information")).toMatchObject({
      ok: true,
      reversed: false,
    });
  });

  it("定義されていない組は、理由とつなげる種類を返す（FR-001）", () => {
    const result = resolveRelation("screen", "requirement");
    expect(result).toEqual({
      ok: false,
      code: "RELATION_NOT_ALLOWED",
      message:
        "「画面」と「要求」は直接つなげません。「画面」とつなげるのは、登場人物・外部システム・活動・システム操作です。",
    });
  });
});

describe("つなげる種類", () => {
  it("元と先のどちらでも数える", () => {
    expect(connectableKinds("requirement")).toEqual(["actor", "business"]);
  });
});
