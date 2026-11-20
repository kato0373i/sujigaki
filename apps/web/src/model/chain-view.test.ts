import { ELEMENT_KINDS, type ElementKind } from "@sujigaki/domain";
import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import {
  chainView,
  HUB_LIMIT,
  highlightedPath,
  VIEW_PRESETS,
} from "./chain-view.ts";

const all = new Set<ElementKind>(ELEMENT_KINDS);
const flow = new Set<ElementKind>(VIEW_PRESETS.flow.kinds);

const screen = elementSnapshot("s1", "screen", { name: "申込入力" });
const oldScreen = elementSnapshot("s9", "screen", { name: "旧管理画面" });
const info = elementSnapshot("i1", "information", { name: "申込" });
const info2 = elementSnapshot("i2", "information", { name: "受講者" });
const usecase = elementSnapshot("uc1", "usecase", {
  name: "研修に申し込む",
  relations: [relationTo(screen, "usecase"), relationTo(info, "usecase")],
});
const activity = elementSnapshot("a1", "activity", {
  name: "研修に申し込む",
  relations: [
    relationTo(usecase, "activity"),
    relationTo(info, "activity"),
    relationTo(info2, "activity"),
  ],
});
const buc = elementSnapshot("f1", "buc", {
  name: "受講申込",
  relations: [relationTo(activity, "buc")],
});
const business = elementSnapshot("b1", "business", {
  name: "申込受付",
  relations: [relationTo(buc, "business")],
});
const requirement = elementSnapshot("r1", "requirement", {
  name: "申込を当日中に処理したい",
  relations: [relationTo(business, "requirement")],
});
const elements = [
  screen,
  oldScreen,
  info,
  info2,
  usecase,
  activity,
  buc,
  business,
  requirement,
];

const names = (view: ReturnType<typeof chainView>) =>
  view?.nodes.map((n) => n.element.id).sort() ?? [];

describe("FR-021 連鎖ビュー", () => {
  it("起点から前後に指定した段数までをたどる", () => {
    expect(names(chainView(elements, "s1", 2, all))).toEqual([
      "a1",
      "i1",
      "s1",
      "uc1",
    ]);
  });

  it("画面から要求までさかのぼると、経路にある要素を強調する", () => {
    const view = chainView(elements, "s1", 5, all);
    if (!view) throw new Error("起点がない");
    const path = highlightedPath(view, "s1");
    expect([...path.nodes].sort()).toEqual([
      "a1",
      "b1",
      "f1",
      "r1",
      "s1",
      "uc1",
    ]);
    // 右の列（情報）へは、起点の画面と同じ列なので広がらない
    expect(path.nodes.has("i1")).toBe(false);
  });

  it("どこにもつながっていない要素は、その要素だけを描く", () => {
    const view = chainView(elements, "s9", 2, all);
    expect(names(view)).toEqual(["s9"]);
    expect(view?.edges).toEqual([]);
  });

  it("FR-022 表示しない種類は段数に数えずに通り抜け、表示する要素どうしをつなぐ", () => {
    const view = chainView(elements, "a1", 2, flow);
    expect(names(view)).toEqual(["a1", "b1", "r1", "uc1"]);
    expect(view?.edges).toContainEqual({ from: "a1", to: "b1" });
  });

  it("起点は、表示しない種類でも描く", () => {
    expect(names(chainView(elements, "s1", 1, flow))).toEqual(["s1", "uc1"]);
  });

  it("FR-023 表示していない種類の要素がつながっている数を、バッジにする", () => {
    const node = chainView(elements, "a1", 1, flow)?.nodes.find(
      (n) => n.element.id === "a1",
    );
    expect(node?.hidden).toEqual([
      { kind: "information", label: "情報", count: 2 },
      { kind: "buc", label: "業務フロー", count: 1 },
    ]);
  });

  it("NFR-002 描く要素は上限までにし、描かなかった数を返す", () => {
    const view = chainView(elements, "s1", 5, all, 3);
    expect(view?.nodes).toHaveLength(3);
    expect(view?.omitted).toBe(5);
    expect(view?.nodes[0]?.element.id).toBe("s1");
  });

  it("ない要素や削除済みの要素を起点にはしない", () => {
    expect(chainView(elements, "none", 2, all)).toBeNull();
    const removed = { ...screen, deletedAt: "2026-11-20T00:00:00.000Z" };
    expect(chainView([removed], "s1", 2, all)).toBeNull();
  });

  it("#151 表示しない情報や登場人物は通り抜けない", () => {
    // 2つの活動が同じ情報を使っていても、業務の流れのプリセットでは情報を通ってたどらない
    const other = elementSnapshot("a2", "activity", {
      name: "申込を確かめる",
      relations: [relationTo(info, "activity")],
    });
    expect(names(chainView([...elements, other], "a1", 2, flow))).not.toContain(
      "a2",
    );
  });

  it("#151 つながりの多い要素からは先をたどらず、たどらなかった数を返す", () => {
    const clerk = elementSnapshot("p1", "actor", { name: "カウンター職員" });
    const activities = Array.from({ length: HUB_LIMIT + 2 }, (_, i) =>
      elementSnapshot(`x${i}`, "activity", {
        name: `活動${i}`,
        relations: [relationTo(clerk, "activity")],
      }),
    );
    const view = chainView([clerk, ...activities], "x0", 3, all);
    expect(names(view)).toEqual(["p1", "x0"]);
    expect(view?.nodes.find((n) => n.element.id === "p1")?.stopped).toBe(
      HUB_LIMIT + 1,
    );
    // 起点なら、つながりが多くても先をたどる
    expect(chainView([clerk, ...activities], "p1", 1, all)?.nodes).toHaveLength(
      HUB_LIMIT + 3,
    );
  });
});
