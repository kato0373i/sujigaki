import {
  type Actor,
  checkPermission,
  type ElementChange,
  type ElementId,
  type ElementSnapshot,
  type Permission,
} from "@sujigaki/domain";
import type { Context } from "hono";
import type { ActorResolver } from "../auth/actor-resolver.ts";
import { ApiError } from "../http/problem.ts";
import { unwrapOrThrow } from "../http/validation.ts";
import type {
  ChangeSet,
  OperationRecord,
  ProjectRepository,
  StoredProject,
} from "../repository/project-repository.ts";

/** ルートが使う、外から渡すもの */
export interface RouteDependencies {
  readonly projects: ProjectRepository;
  readonly actors: ActorResolver;
  readonly now: () => Date;
  readonly newId: () => string;
}

/** 操作した人を決め、権限の表で操作を許すか確かめる（FR-081） */
export async function authorize(
  deps: RouteDependencies,
  c: Context,
  projectId: string,
  permission: Permission,
  subject: string,
): Promise<Actor> {
  const actor = await deps.actors.resolve(c, projectId);
  unwrapOrThrow(checkPermission(actor, permission, subject));
  return actor;
}

export async function loadProject(
  deps: RouteDependencies,
  projectId: string,
): Promise<StoredProject> {
  const stored = await deps.projects.load(projectId);
  if (!stored)
    throw new ApiError("NOT_FOUND", "プロジェクトが見つかりません。");
  return stored;
}

export function findElement(
  stored: StoredProject,
  elementId: string,
): ElementSnapshot {
  const element = stored.document.elements.find((e) => e.id === elementId);
  if (!element) throw new ApiError("NOT_FOUND", "要素が見つかりません。");
  return element;
}

/** `If-Match` のバージョンを読む（FR-070）。要素を変える API では必須にする */
export function ifMatchVersion(c: Context): number {
  const header = c.req.header("If-Match");
  const match = header ? /^(?:W\/)?"?(\d+)"?$/.exec(header.trim()) : null;
  if (!match?.[1]) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "If-Match ヘッダーに、読み込んだときのバージョンを付けてください。",
    );
  }
  return Number(match[1]);
}

/** 今の内容を付けて、バージョンの競合を返す（設計書 5.2 節） */
export function versionConflict(current: ElementSnapshot): ApiError {
  return new ApiError(
    "VERSION_CONFLICT",
    `要素「${current.name}」はバージョン ${current.version} に更新されています。`,
    { current },
  );
}

/** 要素の変更から、操作の記録を作る。変更前と変更後の内容を残す（設計書 4章の operations） */
export function operationsOf(
  before: ElementSnapshot | null,
  change: ElementChange,
): OperationRecord[] {
  const after = change.element.toSnapshot();
  return change.events.map((event) => ({
    type: event.type,
    targetType: "element",
    targetId: event.elementId,
    actorId: event.actorId,
    occurredAt: event.occurredAt,
    before,
    after,
  }));
}

/**
 * 変更の一式を保存する。リポジトリが競合を返したら、今の内容を読み直して付ける
 */
export async function commitOrThrow(
  deps: RouteDependencies,
  projectId: string,
  changes: ChangeSet,
  conflicting?: ElementId,
): Promise<number> {
  const result = await deps.projects.commit(projectId, changes);
  if (result.ok) return result.value.revision;
  if (result.error.code === "VERSION_CONFLICT" && conflicting) {
    const stored = await deps.projects.load(projectId);
    const current = stored?.document.elements.find((e) => e.id === conflicting);
    if (current) throw versionConflict(current);
  }
  throw ApiError.fromDomain(result.error);
}
