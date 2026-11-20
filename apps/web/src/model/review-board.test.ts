import {
  ACTORS,
  elementSnapshot,
  questionSnapshot,
  relationTo,
} from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { defaultFilter, reviewBoardView } from "./review-board.ts";

const filled = { mode: "manual", trigger: "申込が届く", outcome: "審査待ち" };
const actor = elementSnapshot("u1", "actor", { reviewState: "approved" });
const check = elementSnapshot("a1", "activity", {
  name: "申込を確認する",
  reviewState: "needs_check",
  attributes: filled,
  relations: [relationTo(actor, "activity")],
});
const fix = elementSnapshot("a2", "activity", {
  name: "審査する",
  reviewState: "needs_fix",
  attributes: filled,
  relations: [relationTo(actor, "activity")],
});
const flow = elementSnapshot("f1", "buc", {
  reviewState: "approved",
  relations: [relationTo(check, "buc"), relationTo(fix, "buc")],
});
const business = elementSnapshot("b1", "business", {
  name: "申込受付",
  reviewState: "approved",
  relations: [relationTo(flow, "business")],
});
const requirement = elementSnapshot("r1", "requirement", {
  name: "早く審査したい",
  reviewState: "needs_check",
  attributes: { rationale: "待ち時間が長い" },
  relations: [relationTo(business, "requirement")],
});
const usecase = elementSnapshot("uc1", "usecase", {
  name: "申込を登録する",
  reviewState: "needs_check",
});
const elements = [actor, check, fix, flow, business, requirement, usecase];
const violation = {
  rule: "usecaseWithoutScreen" as const,
  elementId: usecase.id,
  message: "このシステム操作は画面につながっていません。",
};

describe("FR-024 確認ボード", () => {
  it("自分が確認するものは、要確認の要素と未回答の問いを、業務ごとにまとめる", () => {
    const question = questionSnapshot("a1", {
      body: "締め切りはいつですか",
      recommendation: "毎月20日",
    });
    const groups = reviewBoardView(
      elements,
      [question],
      [violation],
      "mine",
      null,
    );
    expect(groups.map((g) => g.business?.name ?? null)).toEqual([
      "申込受付",
      null,
    ]);
    expect(groups[0]?.states).toEqual([
      { state: "needs_check", elements: [check, requirement] },
      { state: "unreviewed", elements: [] },
    ]);
    expect(groups[0]?.questions).toMatchObject([
      {
        body: "締め切りはいつですか",
        recommendation: "毎月20日",
        auto: true,
        saved: question,
      },
    ]);
    expect(groups[0]?.violations).toEqual([]);
    expect(groups[1]?.states[0]?.elements).toEqual([usecase]);
  });

  it("直すものは、要修正の要素と検証の違反を出し、問いは出さない", () => {
    const groups = reviewBoardView(elements, [], [violation], "fix", null);
    expect(groups[0]?.states).toEqual([
      { state: "needs_fix", elements: [fix] },
    ]);
    expect(groups[0]?.questions).toEqual([]);
    expect(groups[1]?.violations).toEqual([{ violation, element: usecase }]);
  });

  it("FR-035 空欄から計算した問いを、自動の問いとして同じ一覧に出す", () => {
    const empty = { ...check, attributes: { mode: "manual" } };
    const groups = reviewBoardView(
      [...elements.filter((e) => e !== check), empty],
      [],
      [],
      "all",
      "b1",
    );
    expect(groups[0]?.questions.map((q) => [q.body, q.auto, q.saved])).toEqual([
      ["この活動は何をきっかけに始まりますか", true, null],
      ["この活動が終わったとき、どういう状態になっていますか", true, null],
    ]);
  });

  it("回答済みの問いは出さない", () => {
    const answered = questionSnapshot("a1", {
      state: "answered",
      answer: "毎月20日",
    });
    const groups = reviewBoardView(elements, [answered], [], "mine", "b1");
    expect(groups[0]?.questions).toEqual([]);
  });

  it("業務で絞り込み、何も出すものがない業務は出さない", () => {
    expect(
      reviewBoardView(elements, [], [], "mine", "b1").map(
        (g) => g.business?.id,
      ),
    ).toEqual(["b1"]);
    const quiet = elements.map((e) => ({
      ...e,
      reviewState: "approved" as const,
    }));
    expect(reviewBoardView(quiet, [], [], "mine", null)).toEqual([]);
  });

  it("絞り込みの既定は、業務責任者以上なら確認するもの、編集者なら直すもの", () => {
    expect(defaultFilter(ACTORS.owner)).toBe("mine");
    expect(defaultFilter(ACTORS.admin)).toBe("mine");
    expect(defaultFilter(ACTORS.editor)).toBe("fix");
    expect(defaultFilter(ACTORS.viewer)).toBe("mine");
  });
});

describe("#121 #122 確認ボードの見直し", () => {
  const draft = elementSnapshot("s1", "screen", { name: "申込画面" });
  const used = elementSnapshot("uc2", "usecase", {
    name: "申込を受け付ける",
    relations: [relationTo(draft, "usecase")],
  });
  const activity = elementSnapshot("a3", "activity", {
    name: "申込を受け取る",
    reviewState: "approved",
    attributes: { trigger: "申込が届く", outcome: "受付済み" },
    relations: [relationTo(actor, "activity"), relationTo(used, "activity")],
  });
  const flow2 = elementSnapshot("f2", "buc", {
    reviewState: "approved",
    relations: [relationTo(activity, "buc")],
  });
  const business2 = elementSnapshot("b2", "business", {
    name: "受付",
    reviewState: "approved",
    relations: [relationTo(flow2, "business")],
  });
  const model = [actor, activity, flow2, business2, used, draft];

  it("自分が確認するものに未レビューの要素を出し、活動から使われる要素はその業務にまとめる", () => {
    const groups = reviewBoardView(model, [], [], "mine", null);
    expect(groups.map((g) => g.business?.name ?? null)).toEqual(["受付"]);
    expect(groups[0]?.states[1]).toEqual({
      state: "unreviewed",
      elements: [used, draft],
    });
  });

  it("空欄から作った問いに、空欄の名前を付ける。出さないこともできる", () => {
    const groups = reviewBoardView(model, [], [], "all", "b2");
    expect(
      groups[0]?.questions.map((q) => [q.element.id, q.blank, q.auto]),
    ).toEqual([["a3", "mode", true]]);
    expect(
      reviewBoardView(model, [], [], "all", "b2", false)[0]?.questions,
    ).toEqual([]);
  });
});
