import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { stateDiagram, stateModelOf, stateModels } from "./state-diagram.ts";

// 申込済み →（審査する）→ 承認済み → 完了。申込済み → 取消済み は直接つなぐ
const done = elementSnapshot("st-done", "state", { name: "完了" });
const approved = elementSnapshot("st-approved", "state", {
  name: "承認済み",
  relations: [relationTo(done, "state")],
});
const cancelled = elementSnapshot("st-cancelled", "state", {
  name: "取消済み",
});
const review = elementSnapshot("uc-review", "usecase", {
  name: "審査する",
  relations: [relationTo(approved, "usecase")],
});
const applied = elementSnapshot("st-applied", "state", {
  name: "申込済み",
  relations: [relationTo(review, "state"), relationTo(cancelled, "state")],
});
// ほかの状態の流れの状態。この図には描かない
const paid = elementSnapshot("st-paid", "state", {
  name: "入金済み",
  relations: [],
});
const lonely = elementSnapshot("st-lonely", "state", { name: "保留" });
const model = elementSnapshot("sm-application", "stateModel", {
  name: "申込の状態",
  relations: [
    relationTo(applied, "stateModel"),
    relationTo(approved, "stateModel"),
    relationTo(done, "stateModel"),
    relationTo(cancelled, "stateModel"),
  ],
});
const billing = elementSnapshot("sm-billing", "stateModel", {
  name: "請求の状態",
  relations: [relationTo(paid, "stateModel")],
});
const elements = [
  model,
  billing,
  applied,
  approved,
  done,
  cancelled,
  review,
  paid,
  lonely,
];

describe("#129 状態遷移図", () => {
  it("状態の流れの状態と、状態のあいだのシステム操作を、遷移をたどった段数の列に並べる", () => {
    const diagram = stateDiagram(elements, "sm-application");
    expect(
      diagram?.nodes.map((n) => [n.element.name, n.column, n.start, n.end]),
    ).toEqual([
      ["申込済み", 0, true, false],
      ["取消済み", 1, false, true],
      ["審査する", 1, false, false],
      ["承認済み", 2, false, false],
      ["完了", 3, false, true],
    ]);
    expect(diagram?.edges).toHaveLength(4);
    expect(diagram?.edges).toEqual(
      expect.arrayContaining([
        { from: "st-applied", to: "uc-review" },
        { from: "st-applied", to: "st-cancelled" },
        { from: "st-approved", to: "st-done" },
        { from: "uc-review", to: "st-approved" },
      ]),
    );
  });

  it("入ってくる遷移のない状態がなければ、名前の順で最初の状態から始める", () => {
    const a = elementSnapshot("s-a", "state", { name: "あ" });
    const b = elementSnapshot("s-b", "state", {
      name: "い",
      relations: [relationTo(a, "state")],
    });
    const cyclicA = { ...a, relations: [relationTo(b, "state")] };
    const loop = elementSnapshot("sm-loop", "stateModel", {
      name: "繰り返し",
      relations: [
        relationTo(cyclicA, "stateModel"),
        relationTo(b, "stateModel"),
      ],
    });
    const diagram = stateDiagram([loop, cyclicA, b], "sm-loop");
    expect(diagram?.nodes.map((n) => [n.element.name, n.column])).toEqual([
      ["あ", 0],
      ["い", 1],
    ]);
  });

  it("状態の流れが見つからなければ null を返す", () => {
    expect(stateDiagram(elements, "st-applied")).toBeNull();
    expect(stateDiagram(elements, "no-such")).toBeNull();
  });

  it("状態の流れを名前の順に返し、状態からは親の状態の流れを返す", () => {
    expect(stateModels(elements).map((m) => m.name)).toEqual([
      "申込の状態",
      "請求の状態",
    ]);
    expect(stateModelOf(model, elements)).toBe("sm-application");
    expect(stateModelOf(paid, elements)).toBe("sm-billing");
    expect(stateModelOf(lonely, elements)).toBeNull();
    expect(stateModelOf(review, elements)).toBeNull();
  });
});
