import {
  ELEMENT_KINDS,
  type ElementEvent,
  type ElementId,
  type ElementSnapshot,
  EXTERNAL_LINK_KINDS,
  elementId,
  RELATION_TYPES,
  relationId,
} from "@sujigaki/domain";
import {
  applyImport,
  changedFields,
  type ImportChange,
  readProjectYaml,
  restoreDocument,
} from "@sujigaki/interchange";
import type { Hono } from "hono";
import { z } from "zod";
import { ApiError } from "../http/problem.ts";
import { readBody, unwrapOrThrow } from "../http/validation.ts";
import type {
  OperationRecord,
  Versioned,
} from "../repository/project-repository.ts";
import {
  authorize,
  commitOrThrow,
  loadProject,
  type RouteDependencies,
} from "./context.ts";

const id = z.string().regex(/^[A-Za-z0-9_-]+$/);

/** 画面から送る要素の内容。確認状態・バージョン・日時は送らず、サーバーで決める */
const elementInput = z.strictObject({
  id,
  kind: z.enum(ELEMENT_KINDS),
  name: z.string(),
  summary: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  links: z
    .array(
      z.strictObject({
        id,
        kind: z.enum(EXTERNAL_LINK_KINDS),
        url: z.string(),
        label: z.string().nullable(),
      }),
    )
    .optional(),
  relations: z
    .array(z.strictObject({ id, typeId: z.string(), to: id }))
    .optional(),
});

const changeSetSchema = z.strictObject({
  origin: z.strictObject({
    authorType: z.enum(["ai", "import"]),
    source: z.string().trim().min(1),
  }),
  changes: z
    .array(
      z.discriminatedUnion("type", [
        z.strictObject({ type: z.literal("add"), element: elementInput }),
        z.strictObject({
          type: z.literal("update"),
          baseVersion: z.number().int().min(1),
          element: elementInput,
        }),
        z.strictObject({
          type: z.literal("remove"),
          elementId: id,
          baseVersion: z.number().int().min(1),
        }),
      ]),
    )
    .min(1),
});

const restoreSchema = z.strictObject({ yaml: z.string() });

type ElementInput = z.output<typeof elementInput>;

/** 画面から送った要素の内容を、要素のスナップショットの形にする。つながりの先の種類は、つながりの種類から求める */
function toSnapshot(
  input: ElementInput,
  base: ElementSnapshot | undefined,
  at: string,
): ElementSnapshot {
  return {
    id: elementId(input.id),
    kind: input.kind,
    name: input.name,
    summary: input.summary ?? "",
    attributes: (input.attributes ?? {}) as ElementSnapshot["attributes"],
    reviewState: base?.reviewState ?? "unreviewed",
    authorType: base?.authorType ?? "human",
    source: base?.source ?? null,
    version: base?.version ?? 1,
    deletedAt: null,
    deletedBy: null,
    links: input.links ?? [],
    relations: (input.relations ?? []).map((r) => {
      const type = RELATION_TYPES.find((t) => t.id === r.typeId);
      if (!type || type.from !== input.kind) {
        throw new ApiError(
          "RELATION_NOT_ALLOWED",
          `要素「${input.name}」は、つながりの種類「${r.typeId}」を持てません。`,
        );
      }
      return {
        id: relationId(r.id),
        typeId: r.typeId,
        to: elementId(r.to),
        toKind: type.to,
      };
    }),
    createdAt: base?.createdAt ?? at,
    createdBy: base?.createdBy ?? null,
    updatedAt: base?.updatedAt ?? at,
    updatedBy: base?.updatedBy ?? null,
  };
}

/** 要素ごとのイベントから、操作の記録を作る */
function operationsOf(
  events: readonly ElementEvent[],
  before: ReadonlyMap<ElementId, ElementSnapshot>,
  after: ReadonlyMap<ElementId, ElementSnapshot>,
): OperationRecord[] {
  return events.map((event) => ({
    type: event.type,
    targetType: "element",
    targetId: event.elementId,
    actorId: event.actorId,
    occurredAt: event.occurredAt,
    before: before.get(event.elementId) ?? null,
    after: after.get(event.elementId) ?? null,
  }));
}

/**
 * 読み込みと取り込みの API（設計書 5.1 節、5.6 節）。
 * 差分は画面で計算し、採用した変更だけを送る。サーバーは集約の操作を通して当て直し、不変条件をもう一度確かめる
 */
export function registerInterchangeRoutes(app: Hono, deps: RouteDependencies) {
  const base = "/api/projects/:projectId";

  app.post(`${base}/restore`, async (c) => {
    const projectId = c.req.param("projectId");
    const actor = await authorize(
      deps,
      c,
      projectId,
      "editElement",
      "YAML から復元できる",
    );
    const body = await readBody(c, restoreSchema);
    const read = readProjectYaml(body.yaml);
    if (!read.ok) {
      throw new ApiError(
        "VALIDATION_FAILED",
        "YAML の形式が正しくありません。",
        {
          errors: read.issues.map((issue) => ({
            path: issue.path,
            message:
              issue.line === null
                ? issue.message
                : `${issue.line}行目: ${issue.message}`,
          })),
        },
      );
    }
    const stored = await loadProject(deps, projectId);
    const { elements, questions, decisions, layouts } = stored.document;
    if (
      elements.length + questions.length + decisions.length + layouts.length >
      0
    ) {
      throw new ApiError(
        "PROJECT_NOT_EMPTY",
        "要素があるプロジェクトには復元できません。空のプロジェクトに復元してください。",
      );
    }
    const restored = restoreDocument(read.document, actor);
    const revision = await commitOrThrow(deps, projectId, {
      batchId: deps.newId(),
      project: restored.project,
      elements: restored.elements.map((value) => ({
        value,
        expectedVersion: null,
      })),
      questions: restored.questions,
      decisions: restored.decisions,
      layouts: restored.layouts.map((value) => ({ value, expectedVersion: 0 })),
      operations: [
        {
          type: "ProjectRestored",
          targetType: "project",
          targetId: projectId,
          actorId: actor.userId,
          occurredAt: deps.now().toISOString(),
          before: null,
          after: { elements: restored.elements.length },
        },
      ],
    });
    return c.json({
      revision,
      elements: restored.elements.length,
      questions: restored.questions.length,
      decisions: restored.decisions.length,
      layouts: restored.layouts.length,
    });
  });

  app.post(`${base}/change-sets`, async (c) => {
    const projectId = c.req.param("projectId");
    const actor = await authorize(
      deps,
      c,
      projectId,
      "editElement",
      "取り込みを反映できる",
    );
    const body = await readBody(c, changeSetSchema);
    const stored = await loadProject(deps, projectId);
    const at = deps.now();
    const current = new Map(stored.document.elements.map((e) => [e.id, e]));

    // 画面が送った変更を、今の要素と組み合わせて、取り込みの変更にする
    const changes: ImportChange[] = body.changes.map((change) => {
      if (change.type === "add") {
        const element = toSnapshot(change.element, undefined, at.toISOString());
        return { type: "add", element };
      }
      const targetId =
        change.type === "remove" ? change.elementId : change.element.id;
      const before = current.get(elementId(targetId));
      if (!before)
        throw new ApiError(
          "NOT_FOUND",
          `要素「${targetId}」が見つかりません。`,
        );
      if (change.type === "remove") {
        return {
          type: "remove",
          elementId: before.id,
          baseVersion: change.baseVersion,
          before,
        };
      }
      if (before.kind !== change.element.kind) {
        throw new ApiError(
          "VALIDATION_FAILED",
          `要素「${before.name}」の種類は変えられません。`,
        );
      }
      const after = toSnapshot(change.element, before, at.toISOString());
      return {
        type: "update",
        elementId: before.id,
        baseVersion: change.baseVersion,
        fields: changedFields(before, after),
        restores: before.deletedAt !== null,
        before,
        after,
      };
    });

    const applied = unwrapOrThrow(
      applyImport(stored.document.elements, changes, actor, at, body.origin),
    );
    const after = new Map(applied.elements.map((e) => [e.id, e]));
    const touched = new Set(applied.events.map((e) => e.elementId));
    const versioned: Versioned<ElementSnapshot>[] = [...touched].flatMap(
      (elementIdValue) => {
        const value = after.get(elementIdValue);
        if (!value) return [];
        return [
          {
            value,
            expectedVersion: current.get(elementIdValue)?.version ?? null,
          },
        ];
      },
    );
    // 差分を出したあとの更新は applyImport が見つける。保存の直前に割り込まれたときは、リポジトリが競合を返す
    const revision = await commitOrThrow(deps, projectId, {
      batchId: deps.newId(),
      elements: versioned,
      operations: operationsOf(applied.events, current, after),
    });
    return c.json({ revision, elements: versioned.map((v) => v.value) });
  });
}
