import {
  elementSnapshot,
  questionSnapshot,
  relationTo,
} from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { businessListView, projectProgress } from "./business-list.ts";

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
    // 業務フローごとの活動の数も出す（#159）
    expect(rows[1]?.activities).toEqual({ f1: 1 });
    expect(rows[2]?.activities).toEqual({ f2: 0 });
  });

  it("削除済みの要素は出さない", () => {
    const deleted = { ...other, deletedAt: "2026-11-19T00:00:00.000Z" };
    expect(businessListView([deleted])).toEqual([]);
  });
});

describe("#180 プロジェクト全体の進み具合", () => {
  it("確認状態ごとの数と、未回答の問い・直すもの（要修正と検証の違反）の数を出す", () => {
    const info = elementSnapshot("i1", "information", {
      reviewState: "needs_fix",
    });
    const screen = elementSnapshot("s1", "screen", { reviewState: "approved" });
    const removed = elementSnapshot("s2", "screen", {
      deletedAt: "2026-11-01T00:00:00.000Z",
    });
    const progress = projectProgress(
      [info, screen, removed],
      [
        questionSnapshot("i1", { body: "項目は何ですか" }),
        questionSnapshot("s1", { body: "答えた問い", state: "answered" }),
      ],
      [
        {
          rule: "unusedScreen",
          elementId: screen.id,
          message: "どの操作からも使われていません",
        },
      ],
    );
    expect(progress.counts).toEqual({
      unreviewed: 0,
      needs_check: 0,
      needs_fix: 1,
      approved: 1,
    });
    expect(progress.openQuestions).toBe(1);
    expect(progress.toFix).toBe(2);
  });
});
