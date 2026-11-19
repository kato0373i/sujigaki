import { checkPermission } from "../access/permission.ts";
import type { Actor } from "../access/role.ts";
import type { ElementId } from "../model/element.ts";
import { fail, ok, type Result } from "../shared/result.ts";
import { requiredText } from "../shared/text.ts";
import type { QuestionId } from "./question.ts";

export type DecisionId = string & { readonly __brand: "DecisionId" };
export const decisionId = (value: string) => value as DecisionId;

export interface DecisionSnapshot {
  readonly id: DecisionId;
  /** 何についての決定か */
  readonly topic: string;
  readonly conclusion: string;
  readonly reason: string;
  readonly questionId: QuestionId | null;
  readonly elementIds: readonly ElementId[];
  readonly decidedBy: string | null;
  readonly decidedAt: string;
}

export interface DecisionRecorded {
  readonly type: "DecisionRecorded";
  readonly decisionId: DecisionId;
  readonly elementIds: readonly ElementId[];
  readonly occurredAt: string;
  readonly actorId: string | null;
}

export interface NewDecision {
  readonly id: DecisionId;
  readonly topic: string;
  readonly conclusion: string;
  readonly reason: string;
  readonly questionId?: QuestionId | null;
  readonly elementIds: readonly ElementId[];
}

/**
 * 決定記録の集約（FR-032）。業務責任者以上が記録する（FR-081）。
 * 決定を記録しても、結び付けた要素の確認状態は変えない。
 */
export class Decision {
  private readonly state: DecisionSnapshot;

  private constructor(state: DecisionSnapshot) {
    this.state = state;
  }

  static fromSnapshot(snapshot: DecisionSnapshot): Decision {
    return new Decision(snapshot);
  }

  static record(
    input: NewDecision,
    actor: Actor,
    at: Date,
  ): Result<{
    readonly decision: Decision;
    readonly events: readonly DecisionRecorded[];
  }> {
    const allowed = checkPermission(
      actor,
      "recordDecision",
      "決定を記録できる",
    );
    if (!allowed.ok) return allowed;
    const topic = requiredText(input.topic, "何についての決定か");
    if (!topic.ok) return topic;
    const conclusion = requiredText(input.conclusion, "結論");
    if (!conclusion.ok) return conclusion;
    const reason = requiredText(input.reason, "理由");
    if (!reason.ok) return reason;
    const elementIds = [...new Set(input.elementIds)];
    if (elementIds.length === 0) {
      return fail(
        "VALIDATION_FAILED",
        "決定に関係する要素を1つ以上選んでください。",
      );
    }
    const decidedAt = at.toISOString();
    const decision = new Decision({
      id: input.id,
      topic: topic.value,
      conclusion: conclusion.value,
      reason: reason.value,
      questionId: input.questionId ?? null,
      elementIds,
      decidedBy: actor.userId,
      decidedAt,
    });
    return ok({
      decision,
      events: [
        {
          type: "DecisionRecorded",
          decisionId: input.id,
          elementIds,
          occurredAt: decidedAt,
          actorId: actor.userId,
        },
      ],
    });
  }

  get id(): DecisionId {
    return this.state.id;
  }

  toSnapshot(): DecisionSnapshot {
    return this.state;
  }
}
