import { questionSnapshot } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { draftFromQuestion, EMPTY_DECISION } from "./decision-draft.ts";

describe("FR-032 決定の下書き", () => {
  it("問いを選ぶと、問いの文と回答を入れ、理由は残す", () => {
    const question = questionSnapshot("a1", {
      body: "締め切りはいつですか",
      recommendation: "前日",
      state: "answered",
      answer: "当日の正午",
    });
    expect(
      draftFromQuestion({ ...EMPTY_DECISION, reason: "窓口の都合" }, question),
    ).toEqual({
      questionId: question.id,
      topic: "締め切りはいつですか",
      conclusion: "当日の正午",
      reason: "窓口の都合",
    });
  });

  it("回答がなければ推奨案を入れ、問いを外すと問いの ID だけを消す", () => {
    const question = questionSnapshot("a1", {
      body: "締め切りはいつですか",
      recommendation: "前日",
    });
    const drafted = draftFromQuestion(EMPTY_DECISION, question);
    expect(drafted.conclusion).toBe("前日");
    expect(draftFromQuestion(drafted, undefined)).toEqual({
      ...drafted,
      questionId: null,
    });
  });
});
