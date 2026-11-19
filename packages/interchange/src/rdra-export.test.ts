import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { exportRelatedData } from "./rdra-export.ts";

const reception = elementSnapshot("u1", "actor", {
  name: "受付担当",
  summary: "申込を受け付ける人",
});
const screen = elementSnapshot("s1", "screen", { name: "申込入力" });
const register = elementSnapshot("uc1", "usecase", {
  name: "申込を登録する",
  relations: [relationTo(screen, "usecase")],
});
const confirm = elementSnapshot("a1", "activity", {
  name: "申込を確認する",
  relations: [
    relationTo(reception, "activity"),
    relationTo(register, "activity"),
  ],
});
const check = elementSnapshot("a2", "activity", {
  name: "書類をそろえる",
  relations: [
    relationTo(confirm, "activity"),
    relationTo(reception, "activity"),
  ],
});
const flow = elementSnapshot("f1", "buc", {
  name: "申込受付",
  relations: [relationTo(confirm, "buc"), relationTo(check, "buc")],
});
const business = elementSnapshot("b1", "business", {
  name: "申込",
  relations: [relationTo(flow, "business")],
});
const requirement = elementSnapshot("r1", "requirement", {
  name: "早く受け付けたい",
  relations: [relationTo(business, "requirement")],
});
const removed = elementSnapshot("u9", "actor", {
  name: "削除した担当",
  deletedAt: "2026-11-20T00:00:00.000Z",
});

describe("FR-051 関連データの書き出し", () => {
  it("1行目にシステム名、2行目以降に関係の行をタブ区切りで書く。要求と削除済みの要素は書かない", () => {
    const { text } = exportRelatedData("申込システム", [
      business,
      flow,
      confirm,
      check,
      reception,
      register,
      screen,
      requirement,
      removed,
    ]);
    expect(text.split("\n")).toEqual([
      "申込システム",
      "#child\t業務\tBUC\t申込@@申込受付",
      "#child\tBUC\tアクティビティ\t申込受付@@書類をそろえる//申込受付@@申込を確認する",
      "#edge\tアクティビティ\tUC\t申込を確認する@@申込を登録する",
      "#edge\tアクティビティ\tアクター\t書類をそろえる@@受付担当//申込を確認する@@受付担当",
      "#edge\tUC\t画面\t申込を登録する@@申込入力",
      "#arrow\tアクティビティ\tアクティビティ\t書類をそろえる@@申込を確認する",
      "#comment\tアクター\t説明\t受付担当@@申込を受け付ける人",
      "",
    ]);
    expect(text).not.toContain("早く受け付けたい");
    expect(text).not.toContain("削除した担当");
  });

  it("情報の項目と区分の値は #attribute、状態のステレオタイプは #stereotype に書く", () => {
    const info = elementSnapshot("i1", "information", {
      name: "申込",
      attributes: { items: [{ name: "申込日" }, { name: "氏名" }] },
    });
    const variation = elementSnapshot("v1", "variation", {
      name: "申込の種類",
      attributes: { values: ["個人", "法人"] },
    });
    const state = elementSnapshot("st1", "state", {
      name: "受付済み",
      attributes: { stereotype: "開始" },
    });
    const lines = exportRelatedData("申込システム", [info, variation, state])
      .text.trim()
      .split("\n");
    expect(lines.slice(1)).toEqual([
      "#attribute\t情報\t属性\t申込@@氏名//申込@@申込日",
      "#attribute\tバリエーション\t値\t申込の種類@@個人//申込の種類@@法人",
      "#stereotype\t状態\tStereotype\t受付済み@@開始",
    ]);
  });

  it("タブと改行は空白に、区切りの文字は全角に置き換えて知らせる", () => {
    const odd = elementSnapshot("u2", "actor", {
      name: "受付@@担当",
      summary: "1行目\n2行目//続き",
    });
    const result = exportRelatedData("申込\tシステム", [odd]);
    expect(result.text).toBe(
      "申込 システム\n#comment\tアクター\t説明\t受付＠＠担当@@1行目 2行目／／続き\n",
    );
    expect(result.warnings).toContainEqual({
      type: "replacedText",
      elementId: "u2",
      kindLabel: "登場人物",
      name: "受付@@担当",
    });
  });

  it("同じ種類で名前が重なる要素と、関連データに出てこない要素を知らせる", () => {
    const stateA = elementSnapshot("st1", "state", { name: "受付済み" });
    const stateB = elementSnapshot("st2", "state", { name: "受付済み" });
    const lonely = elementSnapshot("t1", "timer", { name: "毎月の締め" });
    const { warnings } = exportRelatedData("申込システム", [
      stateA,
      stateB,
      lonely,
      requirement,
    ]);
    expect(warnings).toEqual([
      { type: "duplicateName", kindLabel: "状態", name: "受付済み", count: 2 },
      {
        type: "notExported",
        elementId: "st1",
        kindLabel: "状態",
        name: "受付済み",
      },
      {
        type: "notExported",
        elementId: "st2",
        kindLabel: "状態",
        name: "受付済み",
      },
      {
        type: "notExported",
        elementId: "t1",
        kindLabel: "定期処理",
        name: "毎月の締め",
      },
    ]);
  });
});
