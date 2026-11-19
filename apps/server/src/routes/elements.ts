import {
  type Actor,
  ELEMENT_KINDS,
  Element,
  type ElementChange,
  type ElementId,
  type ElementSnapshot,
  EXTERNAL_LINK_KINDS,
  elementId,
  type Permission,
  REVIEW_STATES,
  relationId,
} from "@sujigaki/domain";
import type { Context, Hono } from "hono";
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
  findElement,
  ifMatchVersion,
  loadProject,
  operationsOf,
  type RouteDependencies,
  versionConflict,
} from "./context.ts";

const id = z.string().regex(/^[A-Za-z0-9_-]+$/);
const links = z.array(
  z.strictObject({
    id,
    kind: z.enum(EXTERNAL_LINK_KINDS),
    url: z.string(),
    label: z.string().nullable(),
  }),
);
const attributes = z.record(z.string(), z.unknown());

const createSchema = z.strictObject({
  id: id.optional(),
  kind: z.enum(ELEMENT_KINDS),
  name: z.string(),
  summary: z.string().optional(),
  attributes: attributes.optional(),
  links: links.optional(),
});
const editSchema = z.strictObject({
  name: z.string().optional(),
  summary: z.string().optional(),
  attributes: attributes.optional(),
  links: links.optional(),
});
const relationSchema = z.strictObject({ id: id.optional(), to: id });
const reviewSchema = z.strictObject({ to: z.enum(REVIEW_STATES) });

type Attributes = ElementSnapshot["attributes"];

/** 要素の API（設計書 5.1 節）。要素を変える API は、If-Match のバージョンが今と同じときだけ反映する */
export function registerElementRoutes(app: Hono, deps: RouteDependencies) {
  const base = "/api/projects/:projectId";

  app.get(`${base}/snapshot`, async (c) => {
    const projectId = c.req.param("projectId");
    await authorize(deps, c, projectId, "view", "プロジェクトを見られる");
    const { document, revision } = await loadProject(deps, projectId);
    return c.json({
      revision,
      ...document,
      elements: document.elements.filter((e) => e.deletedAt === null),
    });
  });

  // 削除済みの要素は S-10 だけで使うため、deleted=true のときだけ返す（FR-012）
  app.get(`${base}/elements`, async (c) => {
    const projectId = c.req.param("projectId");
    await authorize(deps, c, projectId, "view", "プロジェクトを見られる");
    if (c.req.query("deleted") !== "true") {
      throw new ApiError(
        "VALIDATION_FAILED",
        "削除済みの要素の一覧だけを返します。deleted=true を付けてください。",
      );
    }
    const { document } = await loadProject(deps, projectId);
    const deleted = document.elements
      .filter((e) => e.deletedAt !== null)
      .sort(
        (a, b) =>
          (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "") ||
          a.id.localeCompare(b.id),
      );
    return c.json({ elements: deleted });
  });

  app.post(`${base}/elements`, async (c) => {
    const projectId = c.req.param("projectId");
    const actor = await authorize(
      deps,
      c,
      projectId,
      "editElement",
      "要素を作れる",
    );
    const body = await readBody(c, createSchema);
    const at = deps.now();
    const created = unwrapOrThrow(
      Element.create(
        {
          id: elementId(body.id ?? deps.newId()),
          kind: body.kind,
          name: body.name,
          ...(body.summary !== undefined && { summary: body.summary }),
          ...(body.attributes && { attributes: body.attributes as Attributes }),
          authorType: "human",
        },
        actor,
        at,
      ),
    );
    const change = body.links
      ? combine(
          created,
          unwrapOrThrow(created.element.replaceLinks(body.links, actor, at)),
        )
      : created;
    const element = change.element.toSnapshot();
    await commitOrThrow(
      deps,
      projectId,
      {
        batchId: deps.newId(),
        elements: [{ value: element, expectedVersion: null }],
        operations: operationsOf(null, change),
      },
      element.id,
    );
    return respond(c, element, 201);
  });

  /** 1つの要素を変える API の共通の流れ。権限 → バージョン → ドメインの操作 → 保存 */
  const mutate = (
    path: string,
    method: "patch" | "post" | "delete",
    permission: Permission,
    subject: string,
    operate: (
      element: Element,
      actor: Actor,
      at: Date,
      c: Context,
      others: readonly ElementSnapshot[],
    ) => Promise<ElementChange>,
  ) => {
    app[method](`${base}/elements/:elementId${path}`, async (c) => {
      const projectId = c.req.param("projectId");
      const actor = await authorize(deps, c, projectId, permission, subject);
      const version = ifMatchVersion(c);
      const stored = await loadProject(deps, projectId);
      const before = findElement(stored, c.req.param("elementId") ?? "");
      if (before.version !== version) throw versionConflict(before);
      const at = deps.now();
      const change = await operate(
        Element.fromSnapshot(before),
        actor,
        at,
        c,
        stored.document.elements,
      );
      const after = change.element.toSnapshot();
      const others = followUps(change, stored.document.elements, actor, at);
      await commitOrThrow(
        deps,
        projectId,
        {
          batchId: deps.newId(),
          elements: [
            { value: after, expectedVersion: version },
            ...others.map((o) => o.versioned),
          ],
          operations: [
            ...operationsOf(before, change),
            ...others.flatMap((o) => o.operations),
          ],
        },
        before.id,
      );
      return respond(c, after);
    });
  };

  mutate(
    "",
    "patch",
    "editElement",
    "要素を編集できる",
    async (element, actor, at, c) => {
      const body = await readBody(c, editSchema);
      const edited = unwrapOrThrow(
        element.edit(
          {
            ...(body.name !== undefined && { name: body.name }),
            ...(body.summary !== undefined && { summary: body.summary }),
            ...(body.attributes && {
              attributes: body.attributes as Attributes,
            }),
          },
          actor,
          at,
        ),
      );
      if (!body.links) return edited;
      return combine(
        edited,
        unwrapOrThrow(edited.element.replaceLinks(body.links, actor, at)),
      );
    },
  );

  mutate(
    "",
    "delete",
    "editElement",
    "要素を削除できる",
    async (element, actor, at) => unwrapOrThrow(element.delete(actor, at)),
  );

  mutate(
    "/restore",
    "post",
    "editElement",
    "要素を復元できる",
    async (element, actor, at) => unwrapOrThrow(element.restore(actor, at)),
  );

  mutate(
    "/relations",
    "post",
    "editElement",
    "つながりを追加できる",
    async (element, actor, at, c, elements) => {
      const body = await readBody(c, relationSchema);
      const target = elements.find((e) => e.id === body.to);
      if (!target)
        throw new ApiError("NOT_FOUND", "つなぐ先の要素が見つかりません。");
      if (target.deletedAt !== null) {
        throw new ApiError(
          "ELEMENT_DELETED",
          "削除済みの要素にはつなげません。",
        );
      }
      return unwrapOrThrow(
        element.addRelation(
          relationId(body.id ?? deps.newId()),
          { id: target.id, kind: target.kind },
          actor,
          at,
        ),
      );
    },
  );

  mutate(
    "/relations/:relationId",
    "delete",
    "editElement",
    "つながりを削除できる",
    async (element, actor, at, c) =>
      unwrapOrThrow(
        element.removeRelation(
          relationId(c.req.param("relationId") ?? ""),
          actor,
          at,
        ),
      ),
  );

  // 確認状態は、遷移ごとに必要なロールが違うため、ドメインの遷移の表で判定する（FR-030）
  mutate(
    "/review-state",
    "post",
    "view",
    "確認状態を見られる",
    async (element, actor, at, c) => {
      const body = await readBody(c, reviewSchema);
      return unwrapOrThrow(element.changeReviewState(body.to, actor, at));
    },
  );

  app.post(`${base}/elements/:elementId/purge`, async (c) => {
    const projectId = c.req.param("projectId");
    const actor = await authorize(
      deps,
      c,
      projectId,
      "purgeElement",
      "要素を完全に削除できる",
    );
    const version = ifMatchVersion(c);
    const stored = await loadProject(deps, projectId);
    const element = findElement(stored, c.req.param("elementId"));
    if (element.version !== version) throw versionConflict(element);
    if (element.deletedAt === null) {
      throw new ApiError(
        "INVALID_TRANSITION",
        "削除していない要素は完全に削除できません。先に削除してください。",
      );
    }
    const operation: OperationRecord = {
      type: "ElementPurged",
      targetType: "element",
      targetId: element.id,
      actorId: actor.userId,
      occurredAt: deps.now().toISOString(),
      before: element,
      after: null,
    };
    await commitOrThrow(
      deps,
      projectId,
      {
        batchId: deps.newId(),
        purgedElements: [{ id: element.id, expectedVersion: version }],
        operations: [operation],
      },
      element.id,
    );
    return c.body(null, 204);
  });
}

function respond(
  c: Context,
  element: ElementSnapshot,
  status: 200 | 201 = 200,
) {
  c.header("ETag", `"${element.version}"`);
  return c.json(element, status);
}

function combine(first: ElementChange, second: ElementChange): ElementChange {
  return {
    element: second.element,
    events: [...first.events, ...second.events],
  };
}

/**
 * 要素を削除したときに、その要素へつながる要素を未レビューに戻す（FR-013、設計書 3章）。
 * 同じ変更の一式で保存する
 */
function followUps(
  change: ElementChange,
  elements: readonly ElementSnapshot[],
  actor: Actor,
  at: Date,
): { versioned: Versioned<ElementSnapshot>; operations: OperationRecord[] }[] {
  if (!change.events.some((e) => e.type === "ElementDeleted")) return [];
  const target: ElementId = change.element.id;
  return elements.flatMap((other) => {
    if (other.id === target) return [];
    const reset = Element.fromSnapshot(other).resetForChangedTarget(
      target,
      actor,
      at,
    );
    if (reset.events.length === 0) return [];
    return [
      {
        versioned: {
          value: reset.element.toSnapshot(),
          expectedVersion: other.version,
        },
        operations: operationsOf(other, reset),
      },
    ];
  });
}
