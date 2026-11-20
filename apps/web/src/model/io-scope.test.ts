import { elementSnapshot } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { scopeChoices, scopedFileName } from "./io-scope.ts";

describe("S-09 範囲", () => {
  it("有効な業務を名前の順に選べる", () => {
    expect(
      scopeChoices([
        elementSnapshot("b2", "business", { name: "請求" }),
        elementSnapshot("b1", "business", { name: "研修" }),
        elementSnapshot("b3", "business", {
          name: "廃止",
          deletedAt: "2026-11-20T00:00:00.000Z",
        }),
        elementSnapshot("f1", "buc", { name: "申込" }),
      ]),
    ).toEqual([
      { businessId: "b1", name: "研修" },
      { businessId: "b2", name: "請求" },
    ]);
  });

  it("業務の範囲なら、ファイルの名前に業務の名前を入れる", () => {
    expect(scopedFileName("社内研修", null, "sujigaki.yaml")).toBe(
      "社内研修.sujigaki.yaml",
    );
    expect(
      scopedFileName(
        "社内研修",
        { businessId: "b1", name: "研修" },
        "rdra.tsv",
      ),
    ).toBe("社内研修-研修.rdra.tsv");
  });
});
