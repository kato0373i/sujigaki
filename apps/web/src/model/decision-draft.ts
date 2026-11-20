import type { QuestionSnapshot } from "@sujigaki/domain";

/** 決定の記録の欄（画面設計書 P-01、FR-032） */
export interface DecisionDraft {
  readonly questionId: string | null;
  readonly topic: string;
  readonly conclusion: string;
  readonly reason: string;
}

export const EMPTY_DECISION: DecisionDraft = {
  questionId: null,
  topic: "",
  conclusion: "",
  reason: "",
};

/** 問いを選んだときの下書き。問いの文を何についての決定かに、回答（なければ推奨案）を結論に入れる。理由は今の入力を残す */
export function draftFromQuestion(
  draft: DecisionDraft,
  question: QuestionSnapshot | undefined,
): DecisionDraft {
  if (!question) return { ...draft, questionId: null };
  return {
    questionId: question.id,
    topic: question.body,
    conclusion: question.answer ?? question.recommendation ?? "",
    reason: draft.reason,
  };
}
