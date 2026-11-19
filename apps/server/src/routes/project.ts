import {
  elementId,
  Layout,
  type LayoutSnapshot,
  type Positions,
  Project,
} from "@sujigaki/domain";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { ApiError } from "../http/problem.ts";
import { readBody, unwrapOrThrow } from "../http/validation.ts";
import {
  authorize,
  ifMatchVersion,
  loadProject,
  type RouteDependencies,
} from "./context.ts";

const layoutSchema = z.strictObject({
  positions: z.record(
    z.string().regex(/^[A-Za-z0-9_-]+$/),
    z.strictObject({ x: z.number(), y: z.number() }),
  ),
});

const settingsSchema = z.strictObject({
  name: z.string().optional(),
  systemName: z.string().optional(),
  summaryMaxLength: z.number().optional(),
});

function layoutConflict(current: LayoutSnapshot): ApiError {
  return new ApiError(
    "VERSION_CONFLICT",
    `図の配置はバージョン ${current.version} に更新されています。`,
    { current },
  );
}

function respondLayout(c: Context, layout: LayoutSnapshot) {
  c.header("ETag", `"${layout.version}"`);
  return c.json(layout);
}

/** 図の配置とプロジェクトの設定の API（設計書 5.1 節） */
export function registerProjectRoutes(app: Hono, deps: RouteDependencies) {
  const base = "/api/projects/:projectId";

  app.put(`${base}/layouts/:bucId`, async (c) => {
    const projectId = c.req.param("projectId");
    const actor = await authorize(
      deps,
      c,
      projectId,
      "editElement",
      "図の配置を変えられる",
    );
    const version = ifMatchVersion(c);
    const body = await readBody(c, layoutSchema);
    const stored = await loadProject(deps, projectId);
    const bucId = c.req.param("bucId");
    const buc = stored.document.elements.find((e) => e.id === bucId);
    if (buc?.kind !== "buc" || buc.deletedAt !== null) {
      throw new ApiError("NOT_FOUND", "業務フローが見つかりません。");
    }
    const saved = stored.document.layouts.find((l) => l.bucId === bucId);
    const layout = saved
      ? Layout.fromSnapshot(saved)
      : Layout.empty(elementId(bucId));
    if (layout.version !== version) throw layoutConflict(layout.toSnapshot());

    const change = unwrapOrThrow(
      layout.save(body.positions as Positions, actor, deps.now()),
    );
    const after = change.layout.toSnapshot();
    if (change.events.length === 0) return respondLayout(c, after);
    const result = await deps.projects.commit(projectId, {
      batchId: deps.newId(),
      layouts: [{ value: after, expectedVersion: version }],
      operations: change.events.map((event) => ({
        type: event.type,
        targetType: "layout",
        targetId: bucId,
        actorId: event.actorId,
        occurredAt: event.occurredAt,
        before: saved ?? null,
        after,
      })),
    });
    if (!result.ok) {
      const current = (
        await deps.projects.load(projectId)
      )?.document.layouts.find((l) => l.bucId === bucId);
      if (result.error.code === "VERSION_CONFLICT" && current)
        throw layoutConflict(current);
      throw ApiError.fromDomain(result.error);
    }
    return respondLayout(c, after);
  });

  app.patch(base, async (c) => {
    const projectId = c.req.param("projectId");
    const actor = await authorize(
      deps,
      c,
      projectId,
      "configureProject",
      "プロジェクトの設定を変えられる",
    );
    const body = await readBody(c, settingsSchema);
    const stored = await loadProject(deps, projectId);
    // 設定の検査と変えた項目は、プロジェクトの集約に任せる。作成日時はここでは使わない
    const project = Project.fromSnapshot({
      id: projectId,
      ...stored.document.project,
      createdAt: new Date(0).toISOString(),
    });
    const at = deps.now();
    const change = unwrapOrThrow(
      project.changeSettings(
        {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.systemName !== undefined && { systemName: body.systemName }),
          ...(body.summaryMaxLength !== undefined && {
            summaryMaxLength: body.summaryMaxLength,
          }),
        },
        actor,
        at,
      ),
    );
    const { name, systemName, summaryMaxLength } = change.project.toSnapshot();
    const settings = { name, systemName, summaryMaxLength };
    if (change.events.length > 0) {
      const result = await deps.projects.commit(projectId, {
        batchId: deps.newId(),
        project: settings,
        operations: change.events.map((event) => ({
          type: event.type,
          targetType: "project",
          targetId: projectId,
          actorId: event.actorId,
          occurredAt: event.occurredAt,
          before: stored.document.project,
          after: settings,
        })),
      });
      if (!result.ok) throw ApiError.fromDomain(result.error);
    }
    return c.json(settings);
  });
}
