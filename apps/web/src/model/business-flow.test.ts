import { elementId } from "@sujigaki/domain";
import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import {
  businessFlowView,
  COLUMN_WIDTH,
  LANE_HEIGHT,
  positionsAfterMove,
  UNASSIGNED_LANE,
} from "./business-flow.ts";

const applicant = elementSnapshot("u1", "actor", { name: "受講者" });
const manager = elementSnapshot("u2", "actor", { name: "上長" });
const info = elementSnapshot("i1", "information", { name: "申込" });
const usecase = elementSnapshot("uc1", "usecase", { name: "申込を登録する" });
const notify = elementSnapshot("a3", "activity", {
  name: "受講案内を送る",
  attributes: { mode: "manual" },
});
const approve = elementSnapshot("a2", "activity", {
  name: "申込を承認する",
  attributes: { mode: "system" },
  relations: [relationTo(manager, "activity"), relationTo(notify, "activity")],
});
const apply = elementSnapshot("a1", "activity", {
  name: "研修に申し込む",
  attributes: { mode: "system" },
  relations: [
    relationTo(applicant, "activity"),
    relationTo(approve, "activity"),
    relationTo(usecase, "activity"),
    relationTo(info, "activity"),
  ],
});
const buc = elementSnapshot("buc1", "buc", {
  name: "研修の受講申込",
  relations: [
    relationTo(notify, "buc"),
    relationTo(approve, "buc"),
    relationTo(apply, "buc"),
  ],
});
const elements = [
  applicant,
  manager,
  info,
  usecase,
  notify,
  approve,
  apply,
  buc,
];

describe("FR-020 業務フローの図", () => {
  const view = businessFlowView(elements, "buc1", undefined, []);

  it("担当者ごとのレーンを流れに出てくる順に作り、最後に担当者が未設定のレーンを置く", () => {
    expect(view?.lanes.map((l) => l.name)).toEqual([
      "受講者",
      "上長",
      UNASSIGNED_LANE,
    ]);
  });

  it("活動を流れの順に左から並べ、担当者のレーンに置く", () => {
    expect(
      view?.cards.map((c) => [
        c.element.name,
        c.position.x / COLUMN_WIDTH,
        c.position.y / LANE_HEIGHT,
      ]),
    ).toEqual([
      ["研修に申し込む", 0, 0],
      ["申込を承認する", 1, 1],
      ["受講案内を送る", 2, 2],
    ]);
    expect(view?.edges).toEqual([
      { from: "a2", to: "a3" },
      { from: "a1", to: "a2" },
    ]);
  });

  it("区分と、つながっているシステム操作と、表示していない種類の数を出す", () => {
    expect(view?.cards[0]).toMatchObject({
      mode: "system",
      usecases: ["申込を登録する"],
      badges: [{ label: "情報", count: 1 }],
    });
    expect(view?.cards[2]?.mode).toBe("manual");
  });

  it("保存した図の配置があれば横の位置に使い、縦の位置は担当者のレーンで決める", () => {
    const layout = {
      bucId: elementId("buc1"),
      version: 1,
      updatedAt: null,
      positions: { [elementId("a1")]: { x: 500, y: 7 } },
    };
    const saved = businessFlowView(elements, "buc1", layout, []);
    expect(saved?.cards[0]?.position).toEqual({ x: 500, y: 0 });
  });

  it("カードを横に動かしたあとの、すべての活動の位置を作る", () => {
    if (!view) throw new Error("業務フローがない");
    expect(positionsAfterMove(view, "a2", 333.4)).toEqual({
      a1: { x: 0, y: 0 },
      a2: { x: 333, y: LANE_HEIGHT },
      a3: { x: 2 * COLUMN_WIDTH, y: 2 * LANE_HEIGHT },
    });
  });

  it("活動の検証の違反を、そのカードに付ける", () => {
    const violation = {
      rule: "activityWithoutActor" as const,
      elementId: notify.id,
      message: "この活動の担当者が設定されていません。",
    };
    const withViolation = businessFlowView(elements, "buc1", undefined, [
      violation,
    ]);
    expect(withViolation?.cards[2]?.violations).toEqual([violation]);
  });

  it("流れが輪になっていても、計算を終える", () => {
    const x = elementSnapshot("x", "activity");
    const y = elementSnapshot("y", "activity", {
      relations: [relationTo(x, "activity")],
    });
    const loop = { ...x, relations: [relationTo(y, "activity")] };
    const flow = elementSnapshot("b", "buc", {
      relations: [relationTo(loop, "buc"), relationTo(y, "buc")],
    });
    expect(
      businessFlowView([loop, y, flow], "b", undefined, [])?.cards,
    ).toHaveLength(2);
  });

  it("活動がない業務フローは、未設定のレーンだけを出す", () => {
    const empty = elementSnapshot("b0", "buc");
    expect(businessFlowView([empty], "b0", undefined, [])).toMatchObject({
      lanes: [{ name: UNASSIGNED_LANE }],
      cards: [],
    });
  });

  it("業務フローでない要素や、ない要素は null を返す", () => {
    expect(businessFlowView(elements, "a1", undefined, [])).toBeNull();
    expect(businessFlowView(elements, "none", undefined, [])).toBeNull();
  });
});
