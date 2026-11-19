import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import {
  cellText,
  filterRows,
  type TraceRow,
  traceRows,
} from "./trace-table.ts";

const screen = elementSnapshot("s1", "screen", { name: "申込画面" });
const info = elementSnapshot("i1", "information", { name: "申込" });
const usecase = elementSnapshot("uc1", "usecase", {
  name: "申込を登録する",
  relations: [relationTo(screen, "usecase"), relationTo(info, "usecase")],
});
const lonelyUsecase = elementSnapshot("uc2", "usecase", {
  name: "請求を締める",
});
const system = elementSnapshot("a1", "activity", {
  name: "申し込む",
  attributes: { mode: "system" },
  relations: [relationTo(usecase, "activity")],
});
const manual = elementSnapshot("a2", "activity", {
  name: "書類を確かめる",
  attributes: { mode: "manual" },
});
const flow = elementSnapshot("f1", "buc", {
  name: "申込受付",
  relations: [relationTo(system, "buc"), relationTo(manual, "buc")],
});
const business = elementSnapshot("b1", "business", {
  name: "申込",
  relations: [relationTo(flow, "business")],
});
const orphanBusiness = elementSnapshot("b2", "business", { name: "請求" });
const requirement = elementSnapshot("r1", "requirement", {
  name: "早く申し込みたい",
  relations: [relationTo(business, "requirement")],
});
const elements = [
  screen,
  info,
  usecase,
  lonelyUsecase,
  system,
  manual,
  flow,
  business,
  orphanBusiness,
  requirement,
];

const texts = (row: TraceRow | undefined) =>
  row
    ? [
        row.cells.requirement,
        row.cells.business,
        row.cells.buc,
        row.cells.activity,
        row.cells.usecase,
        row.cells.screen,
        row.cells.information,
      ].map((c) => (c.gap ? "なし" : cellText(c)))
    : [];

describe("FR-025 トレース表", () => {
  const rows = traceRows(elements);

  it("要求からシステム操作までを1行にし、画面と情報はそのシステム操作につながるものを出す", () => {
    expect(texts(rows[0])).toEqual([
      "早く申し込みたい",
      "申込",
      "申込受付",
      "申し込む",
      "申込を登録する",
      "申込画面",
      "申込",
    ]);
  });

  it("手作業の活動は、システム操作がなくても途切れとは扱わない", () => {
    expect(texts(rows[1])).toEqual([
      "早く申し込みたい",
      "申込",
      "申込受付",
      "書類を確かめる",
      "手作業",
      "",
      "",
    ]);
  });

  it("要求につながらない業務と、活動につながらないシステム操作も、途切れた行として出す", () => {
    expect(texts(rows[2])).toEqual(["なし", "請求", "なし", "", "", "", ""]);
    expect(texts(rows[3])).toEqual([
      "なし",
      "なし",
      "なし",
      "なし",
      "請求を締める",
      "なし",
      "なし",
    ]);
  });

  it("画面につながらないシステム操作の行で、画面の列を途切れにする", () => {
    const noScreen = { ...usecase, relations: [relationTo(info, "usecase")] };
    const row = traceRows(
      elements.map((e) => (e.id === "uc1" ? noScreen : e)),
    )[0];
    expect(row?.cells.screen.gap).toBe(true);
  });

  it("業務フローにも業務にも属さない活動も出す", () => {
    const lonely = elementSnapshot("a9", "activity", { name: "迷子の活動" });
    const rowsWithLonely = traceRows([...elements, lonely]);
    expect(
      rowsWithLonely.some((r) => cellText(r.cells.activity) === "迷子の活動"),
    ).toBe(true);
  });

  it("文字と途切れで絞り込み、列で並べ替える。途切れているセルは最後に回す", () => {
    expect(
      filterRows(rows, { text: "請求", gapsOnly: false, sortBy: null }),
    ).toHaveLength(2);
    expect(
      filterRows(rows, { text: "", gapsOnly: true, sortBy: null }),
    ).toHaveLength(2);
    const sorted = filterRows(rows, {
      text: "",
      gapsOnly: false,
      sortBy: "requirement",
    });
    expect(sorted.map((r) => cellText(r.cells.requirement))).toEqual([
      "早く申し込みたい",
      "早く申し込みたい",
      "",
      "",
    ]);
  });
});
