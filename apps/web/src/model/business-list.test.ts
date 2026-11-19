import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { businessListView } from "./business-list.ts";

describe("FR-010 業務一覧", () => {
  const act = elementSnapshot("a1", "activity", { reviewState: "approved" });
  const flow = elementSnapshot("f1", "buc", {
    name: "研修の受講申込",
    relations: [relationTo(act, "buc")],
  });
  const lonely = elementSnapshot("f2", "buc", { name: "業務に属さない流れ" });
  const business = elementSnapshot("b1", "business", {
    name: "研修",
    reviewState: "needs_check",
    relations: [relationTo(flow, "business")],
  });
  const other = elementSnapshot("b2", "business", { name: "会計" });

  it("業務を名前の順に並べ、その下の業務フローと、確認状態ごとの数を出す", () => {
    const rows = businessListView([act, flow, lonely, business, other]);
    expect(
      rows.map((r) => [r.business?.name ?? null, r.flows.map((f) => f.name)]),
    ).toEqual([
      ["会計", []],
      ["研修", ["研修の受講申込"]],
      [null, ["業務に属さない流れ"]],
    ]);
    expect(rows[1]?.counts).toEqual({
      unreviewed: 1,
      needs_check: 1,
      needs_fix: 0,
      approved: 1,
    });
  });

  it("削除済みの要素は出さない", () => {
    const deleted = { ...other, deletedAt: "2026-11-19T00:00:00.000Z" };
    expect(businessListView([deleted])).toEqual([]);
  });
});
