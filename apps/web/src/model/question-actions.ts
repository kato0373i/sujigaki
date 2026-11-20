import { type Actor, can, type QuestionSnapshot } from "@sujigaki/domain";

/** 詳細パネルで問いに出す操作（画面設計書 P-01、要件定義書 7.2 節）。押せない操作は false */
export interface QuestionActions {
  readonly answer: boolean;
  readonly acceptRecommendation: boolean;
  readonly withdraw: boolean;
  readonly retract: boolean;
  readonly resolve: boolean;
}

export function questionActions(
  question: QuestionSnapshot,
  actor: Actor,
): QuestionActions {
  const open = question.state === "open";
  const answered = question.state === "answered";
  const manage = can(actor, "manageQuestion");
  return {
    answer: open && can(actor, "answerQuestion"),
    acceptRecommendation:
      open && question.recommendation !== null && can(actor, "answerQuestion"),
    withdraw: open && manage,
    // 回答の取り消しは、回答した本人か、編集者以上ができる
    retract:
      answered &&
      (manage ||
        (actor.userId !== null && question.answeredBy === actor.userId)),
    resolve: answered && manage,
  };
}
