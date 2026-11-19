import { type Actor, hasRoleAtLeast } from "../access/role.ts";
import type { ElementId } from "../model/element.ts";
import { fail, ok, type Result } from "../shared/result.ts";

export type QuestionId = string & { readonly __brand: "QuestionId" };
export const questionId = (value: string) => value as QuestionId;

export const QUESTION_STATES = [
  "open",
  "answered",
  "resolved",
  "withdrawn",
] as const;
export type QuestionState = (typeof QUESTION_STATES)[number];

export const QUESTION_STATE_LABELS: Readonly<Record<QuestionState, string>> = {
  open: "未回答",
  answered: "回答済み",
  resolved: "解決",
  withdrawn: "取り下げ",
};

/** 問いを作った人の種類。auto は空欄から作った問い（FR-035） */
export type QuestionAuthorType = "human" | "ai" | "auto";

export interface QuestionSnapshot {
  readonly id: QuestionId;
  readonly elementId: ElementId;
  readonly body: string;
  readonly recommendation: string | null;
  readonly state: QuestionState;
  readonly answer: string | null;
  readonly answeredBy: string | null;
  readonly answeredAt: string | null;
  readonly authorType: QuestionAuthorType;
  readonly createdAt: string;
  readonly createdBy: string | null;
}

interface QuestionEventBase {
  readonly questionId: QuestionId;
  readonly elementId: ElementId;
  readonly occurredAt: string;
  readonly actorId: string | null;
}

export type QuestionEvent = QuestionEventBase &
  (
    | { readonly type: "QuestionAsked" }
    | { readonly type: "QuestionAnswered"; readonly answer: string }
    | { readonly type: "QuestionAnswerRetracted" }
    | { readonly type: "QuestionResolved" }
    | { readonly type: "QuestionWithdrawn" }
  );

export interface QuestionChange {
  readonly question: Question;
  readonly events: readonly QuestionEvent[];
}

export interface NewQuestion {
  readonly id: QuestionId;
  readonly elementId: ElementId;
  readonly body: string;
  readonly recommendation?: string | null;
  readonly authorType: QuestionAuthorType;
}

function required(value: string, label: string): Result<string> {
  const trimmed = value.trim();
  if (trimmed.length === 0)
    return fail("VALIDATION_FAILED", `${label}を入力してください。`);
  return ok(trimmed);
}

/** 未解決の問いの集約（FR-031）。状態の遷移は要件定義書 7.2 節に従う */
export class Question {
  private readonly state: QuestionSnapshot;

  private constructor(state: QuestionSnapshot) {
    this.state = state;
  }

  static fromSnapshot(snapshot: QuestionSnapshot): Question {
    return new Question(snapshot);
  }

  static ask(
    input: NewQuestion,
    actor: Actor,
    at: Date,
  ): Result<QuestionChange> {
    const body = required(input.body, "問い");
    if (!body.ok) return body;
    const recommendation = input.recommendation?.trim() || null;
    const question = new Question({
      id: input.id,
      elementId: input.elementId,
      body: body.value,
      recommendation,
      state: "open",
      answer: null,
      answeredBy: null,
      answeredAt: null,
      authorType: input.authorType,
      createdAt: at.toISOString(),
      createdBy: actor.userId,
    });
    return ok({
      question,
      events: [question.event("QuestionAsked", actor, at)],
    });
  }

  get id(): QuestionId {
    return this.state.id;
  }

  get questionState(): QuestionState {
    return this.state.state;
  }

  toSnapshot(): QuestionSnapshot {
    return this.state;
  }

  /** 回答する。閲覧者も回答できる（US-009） */
  answer(text: string, actor: Actor, at: Date): Result<QuestionChange> {
    const from = this.expectState("open", "回答");
    if (!from.ok) return from;
    const answer = required(text, "回答");
    if (!answer.ok) return answer;
    const question = new Question({
      ...this.state,
      state: "answered",
      answer: answer.value,
      answeredBy: actor.userId,
      answeredAt: at.toISOString(),
    });
    return ok({
      question,
      events: [
        {
          ...question.eventBase(actor, at),
          type: "QuestionAnswered",
          answer: answer.value,
        },
      ],
    });
  }

  /** 推奨案をそのまま回答にする（FR-031） */
  acceptRecommendation(actor: Actor, at: Date): Result<QuestionChange> {
    if (this.state.recommendation === null) {
      return fail("VALIDATION_FAILED", "この問いには推奨案がありません。");
    }
    return this.answer(this.state.recommendation, actor, at);
  }

  /** 回答を取り消す。回答した本人か、編集者以上ができる */
  retractAnswer(actor: Actor, at: Date): Result<QuestionChange> {
    const from = this.expectState("answered", "回答の取り消し");
    if (!from.ok) return from;
    const isAnswerer =
      actor.userId !== null && actor.userId === this.state.answeredBy;
    if (!isAnswerer && !hasRoleAtLeast(actor.role, "editor")) {
      return fail(
        "FORBIDDEN",
        "回答を取り消せるのは、回答した人か編集者以上です。",
      );
    }
    const question = new Question({
      ...this.state,
      state: "open",
      answer: null,
      answeredBy: null,
      answeredAt: null,
    });
    return ok({
      question,
      events: [question.event("QuestionAnswerRetracted", actor, at)],
    });
  }

  /** 回答をモデルに反映し、解決にする。編集者以上ができる */
  resolve(actor: Actor, at: Date): Result<QuestionChange> {
    return this.close(
      "answered",
      "resolved",
      "QuestionResolved",
      "解決",
      actor,
      at,
    );
  }

  /** 不要と判断して取り下げる。編集者以上ができる */
  withdraw(actor: Actor, at: Date): Result<QuestionChange> {
    return this.close(
      "open",
      "withdrawn",
      "QuestionWithdrawn",
      "取り下げ",
      actor,
      at,
    );
  }

  private close(
    from: QuestionState,
    to: QuestionState,
    type: "QuestionResolved" | "QuestionWithdrawn",
    action: string,
    actor: Actor,
    at: Date,
  ): Result<QuestionChange> {
    const current = this.expectState(from, action);
    if (!current.ok) return current;
    if (!hasRoleAtLeast(actor.role, "editor")) {
      return fail("FORBIDDEN", `問いの${action}ができるのは、編集者以上です。`);
    }
    const question = new Question({ ...this.state, state: to });
    return ok({ question, events: [question.event(type, actor, at)] });
  }

  private expectState(expected: QuestionState, action: string): Result<void> {
    if (this.state.state !== expected) {
      const label = QUESTION_STATE_LABELS[this.state.state];
      return fail(
        "INVALID_TRANSITION",
        `「${label}」の問いには、${action}はできません。`,
      );
    }
    return ok(undefined);
  }

  private eventBase(actor: Actor, at: Date): QuestionEventBase {
    return {
      questionId: this.state.id,
      elementId: this.state.elementId,
      occurredAt: at.toISOString(),
      actorId: actor.userId,
    };
  }

  private event(
    type:
      | "QuestionAsked"
      | "QuestionAnswerRetracted"
      | "QuestionResolved"
      | "QuestionWithdrawn",
    actor: Actor,
    at: Date,
  ): QuestionEvent {
    return { ...this.eventBase(actor, at), type };
  }
}
