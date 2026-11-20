import type { ElementId, ElementSnapshot } from "@sujigaki/domain";

/** 状態遷移図の要素。状態か、状態のあいだに置くシステム操作 */
export interface StateDiagramNode {
  readonly element: ElementSnapshot;
  /** 左から数えた列。遷移をたどった段数にする */
  readonly column: number;
  /** 列の中の上からの順 */
  readonly row: number;
  /** 入ってくる遷移のない状態か。システム操作では常に false */
  readonly start: boolean;
  /** 出ていく遷移のない状態か。システム操作では常に false */
  readonly end: boolean;
}

/** 向きのある線。from から to へ矢印を引く */
export interface StateDiagramEdge {
  readonly from: ElementId;
  readonly to: ElementId;
}

export interface StateDiagram {
  readonly model: ElementSnapshot;
  readonly nodes: readonly StateDiagramNode[];
  readonly edges: readonly StateDiagramEdge[];
}

const byName = (a: ElementSnapshot, b: ElementSnapshot) =>
  a.name.localeCompare(b.name, "ja");

/** 削除されていない状態の流れを、名前の順に返す */
export function stateModels(
  elements: readonly ElementSnapshot[],
): ElementSnapshot[] {
  return elements
    .filter((e) => e.kind === "stateModel" && e.deletedAt === null)
    .sort(byName);
}

/**
 * 要素を状態遷移図で開くときの状態の流れ。状態の流れならその要素、状態なら親の状態の流れを返す。
 * 親のない状態と、ほかの種類の要素では null を返す
 */
export function stateModelOf(
  element: ElementSnapshot,
  elements: readonly ElementSnapshot[],
): ElementId | null {
  if (element.kind === "stateModel") return element.id;
  if (element.kind !== "state") return null;
  return (
    stateModels(elements).find((m) =>
      m.relations.some((r) => r.to === element.id),
    )?.id ?? null
  );
}

/**
 * 状態の流れの状態遷移図（画面設計書 S-14）。状態の流れの子の状態と、そのあいだの遷移を返す。
 * 状態からシステム操作へ、システム操作から状態へのつながりは、システム操作を状態のあいだに置く。
 * ほかの状態の流れの状態へのつながりは描かない。状態の流れが見つからなければ null を返す
 */
export function stateDiagram(
  elements: readonly ElementSnapshot[],
  modelId: string,
): StateDiagram | null {
  const active = elements.filter((e) => e.deletedAt === null);
  const byId = new Map(active.map((e) => [e.id as string, e]));
  const model = byId.get(modelId);
  if (model?.kind !== "stateModel") return null;

  const states = model.relations
    .flatMap((r) => {
      const state = byId.get(r.to);
      return state?.kind === "state" ? [state] : [];
    })
    .filter((s, i, all) => all.findIndex((t) => t.id === s.id) === i)
    .sort(byName);
  const inModel = new Set<string>(states.map((s) => s.id));

  const usecases = new Map<string, ElementSnapshot>();
  const edges: StateDiagramEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (from: ElementId, to: ElementId) => {
    const key = `${from}\n${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to });
  };
  for (const state of states) {
    for (const r of state.relations) {
      const other = byId.get(r.to);
      if (!other) continue;
      if (other.kind === "state" && inModel.has(other.id)) {
        addEdge(state.id, other.id);
      } else if (other.kind === "usecase") {
        usecases.set(other.id, other);
        addEdge(state.id, other.id);
      }
    }
  }
  for (const usecase of active.filter((e) => e.kind === "usecase")) {
    for (const r of usecase.relations) {
      if (!inModel.has(r.to)) continue;
      usecases.set(usecase.id, usecase);
      addEdge(usecase.id, r.to);
    }
  }

  const members = [...states, ...[...usecases.values()].sort(byName)];
  const incoming = new Set<string>(edges.map((e) => e.to));
  const outgoing = new Set<string>(edges.map((e) => e.from));

  // 入ってくる線のない要素から、線をたどった段数で列を決める
  const roots = members.filter((m) => !incoming.has(m.id));
  const first = states[0];
  const level = new Map<string, number>();
  const queue = roots.length > 0 ? roots : first ? [first] : [];
  for (const root of queue) level.set(root.id, 0);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i] as ElementSnapshot;
    const next = (level.get(current.id) ?? 0) + 1;
    for (const edge of edges.filter((e) => e.from === current.id)) {
      if (level.has(edge.to)) continue;
      level.set(edge.to, next);
      const target = byId.get(edge.to);
      if (target) queue.push(target);
    }
  }
  // たどれない要素は右端の列に置く
  const last = Math.max(-1, ...level.values()) + 1;
  const rows = new Map<number, number>();
  const nodes = members
    .map((element) => ({ element, column: level.get(element.id) ?? last }))
    .sort((a, b) => a.column - b.column)
    .map(({ element, column }) => {
      const row = rows.get(column) ?? 0;
      rows.set(column, row + 1);
      const isState = element.kind === "state";
      return {
        element,
        column,
        row,
        start: isState && !incoming.has(element.id),
        end: isState && !outgoing.has(element.id),
      };
    });
  return { model, nodes, edges };
}
