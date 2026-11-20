import { questionSnapshot } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { questionActions } from "./question-actions.ts";

const editor = { userId: "u1", role: "editor" } as const;
const viewer = { userId: "u2", role: "viewer" } as const;

describe("FR-031 問いの操作", () => {
  it("未回答の問いは、回答・推奨案での回答・取り下げができる。取り下げは編集者以上", () => {
    const open = questionSnapshot("a1", { recommendation: "上長" });
    expect(questionActions(open, editor)).toEqual({
      answer: true,
      acceptRecommendation: true,
      withdraw: true,
      retract: false,
      resolve: false,
    });
    expect(questionActions(open, viewer)).toMatchObject({
      answer: true,
      withdraw: false,
    });
    expect(
      questionActions({ ...open, recommendation: null }, editor)
        .acceptRecommendation,
    ).toBe(false);
  });

  it("回答済みの問いは、回答の取り消しと解決ができる。閲覧者は自分の回答だけを取り消せる", () => {
    const answered = questionSnapshot("a1", {
      state: "answered",
      answer: "上長",
      answeredBy: "u2",
    });
    expect(questionActions(answered, editor)).toEqual({
      answer: false,
      acceptRecommendation: false,
      withdraw: false,
      retract: true,
      resolve: true,
    });
    expect(questionActions(answered, viewer)).toMatchObject({
      retract: true,
      resolve: false,
    });
    expect(
      questionActions({ ...answered, answeredBy: "u9" }, viewer).retract,
    ).toBe(false);
  });

  it("解決と取り下げの問いには、操作を出さない", () => {
    for (const state of ["resolved", "withdrawn"] as const) {
      expect(
        Object.values(
          questionActions(questionSnapshot("a1", { state }), editor),
        ),
      ).toEqual([false, false, false, false, false]);
    }
  });
});
