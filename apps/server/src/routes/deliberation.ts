import {
  Decision,
  decisionId,
  elementId,
  QUESTION_AUTHOR_TYPES,
  Question,
  type QuestionChange,
  questionId,
} from "@sujigaki/domain";
import type { Hono } from "hono";
import { z } from "zod";
import { ApiError } from "../http/problem.ts";
import { readBody, unwrapOrThrow } from "../http/validation.ts";
import type { OperationRecord } from "../repository/project-repository.ts";
import {
  authorize,
  commitOrThrow,
  loadProject,
  type RouteDependencies,
} from "./context.ts";

const id = z.string().regex(/^[A-Za-z0-9_-]+$/);

const askSchema = z.strictObject({
  id: id.optional(),
  elementId: id,
  body: z.string(),
  recommendation: z.string().nullable().optional(),
  authorType: z.enum(QUESTION_AUTHOR_TYPES).optional(),
});

const stateSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("answer"), answer: z.string() }),
  z.strictObject({ action: z.literal("acceptRecommendation") }),
  z.strictObject({ action: z.literal("retract") }),
  z.strictObject({ action: z.literal("resolve") }),
  z.strictObject({ action: z.literal("withdraw") }),
]);

const decisionSchema = z.strictObject({
  id: id.optional(),
  topic: z.string(),
  conclusion: z.string(),
  reason: z.string(),
  questionId: id.nullable().optional(),
  elementIds: z.array(id),
});

function questionOperations(
  before: unknown,
  change: QuestionChange,
): OperationRecord[] {
  const after = change.question.toSnapshot();
  return change.events.map((event) => ({
    type: event.type,
    targetType: "question",
    targetId: event.questionId,
    actorId: event.actorId,
    occurredAt: event.occurredAt,
    before,
    after,
  }));
}

/**
 * 問いと決定記録の API（設計書 5.1 節）。
 * 問いはバージョンを持たないため、状態の遷移の表で、今の状態からできる操作かを確かめる（要件定義書 7.2 節）
 */
export function registerDeliberationRoutes(app: Hono, deps: RouteDependencies) {
  const base = "/api/projects/:projectId";

  app.post(`${base}/questions`, async (c) => {
    const projectId = c.req.param("projectId");
    const actor = await authorize(
      deps,
      c,
      projectId,
      "askQuestion",
      "問いを作れる",
    );
    const body = await readBody(c, askSchema);
    const stored = await loadProject(deps, projectId);
    const target = stored.document.elements.find(
      (e) => e.id === body.elementId,
    );
    if (!target || target.deletedAt !== null) {
      throw new ApiError("NOT_FOUND", "問いの対象の要素が見つかりません。");
    }
    const change = unwrapOrThrow(
      Question.ask(
        {
          id: questionId(body.id ?? deps.newId()),
          elementId: elementId(body.elementId),
          body: body.body,
          recommendation: body.recommendation ?? null,
          authorType: body.authorType ?? "human",
        },
        actor,
        deps.now(),
      ),
    );
    const question = change.question.toSnapshot();
    if (stored.document.questions.some((q) => q.id === question.id)) {
      throw new ApiError(
        "VALIDATION_FAILED",
        "同じ ID の問いがすでにあります。",
      );
    }
    await commitOrThrow(deps, projectId, {
      batchId: deps.newId(),
      questions: [question],
      operations: questionOperations(null, change),
    });
    return c.json(question, 201);
  });

  app.post(`${base}/questions/:questionId/state`, async (c) => {
    const projectId = c.req.param("projectId");
    // 操作ごとに必要なロールが違うため、ここでは閲覧できることだけを確かめ、残りは問いの集約が判定する
    const actor = await authorize(deps, c, projectId, "view", "問いを見られる");
    const body = await readBody(c, stateSchema);
    const stored = await loadProject(deps, projectId);
    const snapshot = stored.document.questions.find(
      (q) => q.id === c.req.param("questionId"),
    );
    if (!snapshot) throw new ApiError("NOT_FOUND", "問いが見つかりません。");
    const question = Question.fromSnapshot(snapshot);
    const at = deps.now();
    const change = unwrapOrThrow(
      body.action === "answer"
        ? question.answer(body.answer, actor, at)
        : body.action === "acceptRecommendation"
          ? question.acceptRecommendation(actor, at)
          : body.action === "retract"
            ? question.retractAnswer(actor, at)
            : body.action === "resolve"
              ? question.resolve(actor, at)
              : question.withdraw(actor, at),
    );
    await commitOrThrow(deps, projectId, {
      batchId: deps.newId(),
      questions: [change.question.toSnapshot()],
      operations: questionOperations(snapshot, change),
    });
    return c.json(change.question.toSnapshot());
  });

  app.post(`${base}/decisions`, async (c) => {
    const projectId = c.req.param("projectId");
    const actor = await authorize(
      deps,
      c,
      projectId,
      "recordDecision",
      "決定を記録できる",
    );
    const body = await readBody(c, decisionSchema);
    const stored = await loadProject(deps, projectId);
    const known = new Set(stored.document.elements.map((e) => e.id as string));
    const missing = body.elementIds.find((e) => !known.has(e));
    if (missing) {
      throw new ApiError(
        "NOT_FOUND",
        `決定に関係する要素「${missing}」が見つかりません。`,
      );
    }
    if (
      body.questionId &&
      !stored.document.questions.some((q) => q.id === body.questionId)
    ) {
      throw new ApiError(
        "NOT_FOUND",
        "決定のもとになった問いが見つかりません。",
      );
    }
    const { decision, events } = unwrapOrThrow(
      Decision.record(
        {
          id: decisionId(body.id ?? deps.newId()),
          topic: body.topic,
          conclusion: body.conclusion,
          reason: body.reason,
          questionId: body.questionId ? questionId(body.questionId) : null,
          elementIds: body.elementIds.map(elementId),
        },
        actor,
        deps.now(),
      ),
    );
    const snapshot = decision.toSnapshot();
    await commitOrThrow(deps, projectId, {
      batchId: deps.newId(),
      decisions: [snapshot],
      operations: events.map((event) => ({
        type: event.type,
        targetType: "decision",
        targetId: snapshot.id,
        actorId: event.actorId,
        occurredAt: event.occurredAt,
        before: null,
        after: snapshot,
      })),
    });
    return c.json(snapshot, 201);
  });
}
