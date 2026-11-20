import {
  type Actor,
  type AuthorType,
  checkPermission,
  Element,
  type ElementChange,
  type ElementEvent,
  type ElementId,
  type ElementSnapshot,
  fail,
  ok,
  type Result,
} from "@sujigaki/domain";
import { type ImportChange, relationKey } from "./import-diff.ts";

/** 取り込んだ要素の作成者の種類と出所（FR-034）。AI の提案なら ai、ファイルの読み込みなら import */
export interface ImportOrigin {
  readonly authorType: Exclude<AuthorType, "human">;
  readonly source: string;
}

export interface AppliedImport {
  /** 反映したあとの、すべての要素 */
  readonly elements: readonly ElementSnapshot[];
  readonly events: readonly ElementEvent[];
}

/**
 * 採用した変更を、要素の集約の操作として当てる。1件でも当てられなければ、何も反映しない。
 * 集約の操作を通すため、内容やつながりが変わった要素は未レビューに戻り、外部リンクだけの変更では戻らない（FR-013）。
 * 削除した要素へのつながりを持つ要素も、未レビューに戻す。
 */
export function applyImport(
  current: readonly ElementSnapshot[],
  changes: readonly ImportChange[],
  actor: Actor,
  at: Date,
  /** 追加した要素の作成者の種類と出所。追加を含まないときは null でよい */
  origin: ImportOrigin | null,
): Result<AppliedImport> {
  const allowed = checkPermission(actor, "editElement", "取り込みを反映できる");
  if (!allowed.ok) return allowed;

  const elements = new Map(current.map((e) => [e.id, Element.fromSnapshot(e)]));
  const events: ElementEvent[] = [];
  const removed: ElementId[] = [];

  for (const change of changes) {
    const result =
      change.type === "add"
        ? add(elements, change.element, actor, at, origin)
        : update(elements, change, actor, at);
    if (!result.ok) return result;
    elements.set(result.value.element.id, result.value.element);
    events.push(...result.value.events);
    if (change.type === "remove") removed.push(change.elementId);
  }

  for (const target of removed) {
    for (const [id, element] of elements) {
      const reset = element.resetForChangedTarget(target, actor, at);
      elements.set(id, reset.element);
      events.push(...reset.events);
    }
  }
  return ok({
    elements: [...elements.values()].map((e) => e.toSnapshot()),
    events,
  });
}

type Step = (element: Element) => Result<ElementChange>;

/** 操作を順に当て、イベントをまとめる */
function chain(
  start: ElementChange,
  steps: readonly Step[],
): Result<ElementChange> {
  let element = start.element;
  const events = [...start.events];
  for (const step of steps) {
    const result = step(element);
    if (!result.ok) return result;
    element = result.value.element;
    events.push(...result.value.events);
  }
  return ok({ element, events });
}

function add(
  elements: ReadonlyMap<ElementId, Element>,
  incoming: ElementSnapshot,
  actor: Actor,
  at: Date,
  origin: ImportOrigin | null,
): Result<ElementChange> {
  if (!origin) {
    return fail(
      "VALIDATION_FAILED",
      `要素「${incoming.name}」を追加するには、作成者の種類と出所が必要です。`,
    );
  }
  if (elements.has(incoming.id)) {
    return fail(
      "VERSION_CONFLICT",
      `要素「${incoming.name}」は、差分を出したあとにほかの人が作っています。差分を出し直してください。`,
    );
  }
  const created = Element.create(
    {
      id: incoming.id,
      kind: incoming.kind,
      name: incoming.name,
      summary: incoming.summary,
      attributes: incoming.attributes,
      authorType: origin.authorType,
      source: origin.source,
    },
    actor,
    at,
  );
  if (!created.ok) return created;
  return chain(created.value, [
    ...(incoming.links.length > 0
      ? [(e: Element) => e.replaceLinks(incoming.links, actor, at)]
      : []),
    ...incoming.relations.map(
      (r) => (e: Element) =>
        e.addRelation(r.id, { id: r.to, kind: r.toKind }, actor, at),
    ),
  ]);
}

function update(
  elements: ReadonlyMap<ElementId, Element>,
  change: Exclude<ImportChange, { type: "add" }>,
  actor: Actor,
  at: Date,
): Result<ElementChange> {
  const element = elements.get(change.elementId);
  if (!element) {
    return fail("NOT_FOUND", `要素「${change.before.name}」が見つかりません。`);
  }
  if (element.version !== change.baseVersion) {
    return fail(
      "VERSION_CONFLICT",
      `要素「${change.before.name}」は、差分を出したあとにほかの人が更新しています。最新の内容と比べてから取り込んでください。`,
    );
  }
  const start: ElementChange = { element, events: [] };
  if (change.type === "remove") {
    return chain(start, [(e) => e.delete(actor, at)]);
  }

  const { after } = change;
  const afterKeys = new Set(after.relations.map(relationKey));
  const beforeKeys = new Set(element.relations.map(relationKey));
  const steps: Step[] = [];
  if (change.restores) steps.push((e) => e.restore(actor, at));
  steps.push((e) =>
    e.edit(
      {
        name: after.name,
        summary: after.summary,
        attributes: after.attributes,
      },
      actor,
      at,
    ),
  );
  if (change.fields.includes("links")) {
    steps.push((e) => e.replaceLinks(after.links, actor, at));
  }
  for (const r of element.relations) {
    if (!afterKeys.has(relationKey(r))) {
      steps.push((e) => e.removeRelation(r.id, actor, at));
    }
  }
  for (const r of after.relations) {
    if (!beforeKeys.has(relationKey(r))) {
      steps.push((e) =>
        e.addRelation(r.id, { id: r.to, kind: r.toKind }, actor, at),
      );
    }
  }
  return chain(start, steps);
}
