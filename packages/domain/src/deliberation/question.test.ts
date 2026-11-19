import { describe, expect, it } from "vitest";
import type { Actor } from "../access/role.ts";
import { elementId } from "../model/element.ts";
import { Question, questionId } from "./question.ts";

const viewer: Actor = { userId: "v1", role: "viewer" };
const otherViewer: Actor = { userId: "v2", role: "viewer" };
const editor: Actor = { userId: "e1", role: "editor" };
const at = new Date("2026-11-19T00:00:00Z");

function asked(recommendation: string | null = "研修担当"): Question {
  const result = Question.ask(
    {
      id: questionId("q1"),
      elementId: elementId("a1"),
      body: "この活動は誰が担当しますか",
      recommendation,
      authorType: "auto",
    },
    editor,
    at,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value.question;
}

function answeredBy(actor: Actor): Question {
  const result = asked().answer("研修担当", actor, at);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.question;
}

describe("問いを作る", () => {
  it("未回答で作る", () => {
    expect(asked().questionState).toBe("open");
  });

  it("本文が空なら作らない", () => {
    const result = Question.ask(
      {
        id: questionId("q1"),
        elementId: elementId("a1"),
        body: " ",
        authorType: "human",
      },
      editor,
      at,
    );
    expect(result.ok === false && result.error.message).toBe(
      "問いを入力してください。",
    );
  });
});

describe("回答する（FR-031）", () => {
  it("閲覧者も回答できる", () => {
    const question = answeredBy(viewer);
    expect(question.toSnapshot()).toMatchObject({
      state: "answered",
      answer: "研修担当",
      answeredBy: "v1",
    });
  });

  it("推奨案をそのまま回答にできる", () => {
    const result = asked().acceptRecommendation(viewer, at);
    expect(result.ok && result.value.question.toSnapshot().answer).toBe(
      "研修担当",
    );
  });

  it("推奨案がなければ採用できない", () => {
    const result = asked(null).acceptRecommendation(viewer, at);
    expect(result.ok).toBe(false);
  });

  it("回答済みの問いには、もう一度回答できない", () => {
    const result = answeredBy(viewer).answer("上長", viewer, at);
    expect(result.ok === false && result.error.code).toBe("INVALID_TRANSITION");
  });
});

describe("回答を取り消す", () => {
  it("回答した本人は取り消せる", () => {
    const result = answeredBy(viewer).retractAnswer(viewer, at);
    expect(result.ok && result.value.question.toSnapshot()).toMatchObject({
      state: "open",
      answer: null,
    });
  });

  it("ほかの閲覧者は取り消せない", () => {
    const result = answeredBy(viewer).retractAnswer(otherViewer, at);
    expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
  });

  it("編集者は取り消せる", () => {
    expect(answeredBy(viewer).retractAnswer(editor, at).ok).toBe(true);
  });
});

describe("解決と取り下げ", () => {
  it("編集者は回答済みの問いを解決にできる", () => {
    const result = answeredBy(viewer).resolve(editor, at);
    expect(result.ok && result.value.question.questionState).toBe("resolved");
  });

  it("閲覧者は解決にできない", () => {
    const result = answeredBy(viewer).resolve(viewer, at);
    expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
  });

  it("未回答の問いは解決にできない", () => {
    const result = asked().resolve(editor, at);
    expect(result.ok === false && result.error.message).toBe(
      "「未回答」の問いには、解決はできません。",
    );
  });

  it("編集者は未回答の問いを取り下げられる", () => {
    const result = asked().withdraw(editor, at);
    expect(result.ok && result.value.question.questionState).toBe("withdrawn");
  });
});
