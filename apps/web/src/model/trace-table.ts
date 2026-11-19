import type { ElementKind, ElementSnapshot } from "@sujigaki/domain";

/** トレース表の列（画面設計書 S-07） */
export const TRACE_COLUMNS = [
  { key: "requirement", label: "要求" },
  { key: "business", label: "業務" },
  { key: "buc", label: "業務フロー" },
  { key: "activity", label: "活動" },
  { key: "usecase", label: "システム操作" },
  { key: "screen", label: "画面" },
  { key: "information", label: "情報" },
] as const satisfies readonly { key: ElementKind; label: string }[];

export type TraceColumn = (typeof TRACE_COLUMNS)[number]["key"];

/** トレース表のセル。画面と情報は、1つのシステム操作につながる要素をまとめて1つのセルに出す */
export interface TraceCell {
  readonly elements: readonly ElementSnapshot[];
  /** つながりが途切れているか。途切れていれば「なし」と出す */
  readonly gap: boolean;
  /** 要素のかわりに出す説明（手作業の活動のシステム操作など）。途切れではない */
  readonly note?: string;
}

export interface TraceRow {
  readonly key: string;
  readonly cells: Readonly<Record<TraceColumn, TraceCell>>;
}

const cell = (elements: readonly ElementSnapshot[]): TraceCell => ({
  elements,
  gap: elements.length === 0,
});
const note = (text: string): TraceCell => ({
  elements: [],
  gap: false,
  note: text,
});
const empty: TraceCell = { elements: [], gap: false };

/**
 * トレース表の行を作る（FR-025）。1行は、要求からシステム操作までの1本の経路にする。
 * 上流のない業務・業務フロー・システム操作や、下流のない要求も、途切れた行として出す。
 * 手作業の活動は、システム操作がなくても途切れとは扱わない
 */
export function traceRows(elements: readonly ElementSnapshot[]): TraceRow[] {
  const active = elements.filter((e) => e.deletedAt === null);
  const byId = new Map(active.map((e) => [e.id as string, e]));
  const children = (parent: ElementSnapshot, kind: ElementKind) =>
    parent.relations
      .map((r) => byId.get(r.to))
      .filter((e): e is ElementSnapshot => e?.kind === kind);
  const parents = (child: ElementSnapshot, kind: ElementKind) =>
    active.filter(
      (e) => e.kind === kind && e.relations.some((r) => r.to === child.id),
    );
  const ofKind = (kind: ElementKind) => active.filter((e) => e.kind === kind);

  const rows: TraceRow[] = [];
  const reachedBusinesses = new Set<string>();
  const reachedFlows = new Set<string>();
  const reachedUsecases = new Set<string>();
  const reachedActivities = new Set<string>();

  const usecaseCells = (usecase: ElementSnapshot) => ({
    usecase: cell([usecase]),
    screen: cell(children(usecase, "screen")),
    information: cell(children(usecase, "information")),
  });

  /** 業務フローから下の行。業務フローがなければ、業務フローの列を途切れとする */
  const fromFlow = (
    upstream: Pick<Record<TraceColumn, TraceCell>, "requirement" | "business">,
    flow: ElementSnapshot | null,
    key: string,
  ) => {
    if (!flow) {
      rows.push({
        key,
        cells: {
          ...upstream,
          buc: cell([]),
          activity: empty,
          usecase: empty,
          screen: empty,
          information: empty,
        },
      });
      return;
    }
    reachedFlows.add(flow.id);
    const activities = children(flow, "activity");
    if (activities.length === 0) {
      rows.push({
        key: `${key}/${flow.id}`,
        cells: {
          ...upstream,
          buc: cell([flow]),
          activity: cell([]),
          usecase: empty,
          screen: empty,
          information: empty,
        },
      });
      return;
    }
    for (const activity of activities) {
      reachedActivities.add(activity.id);
      const usecases = children(activity, "usecase");
      const base = {
        ...upstream,
        buc: cell([flow]),
        activity: cell([activity]),
      };
      const path = `${key}/${flow.id}/${activity.id}`;
      if (usecases.length === 0) {
        const manual = activity.attributes.mode === "manual";
        rows.push({
          key: path,
          cells: {
            ...base,
            usecase: manual ? note("手作業") : cell([]),
            screen: empty,
            information: empty,
          },
        });
        continue;
      }
      for (const usecase of usecases) {
        reachedUsecases.add(usecase.id);
        rows.push({
          key: `${path}/${usecase.id}`,
          cells: { ...base, ...usecaseCells(usecase) },
        });
      }
    }
  };

  /** 業務から下の行 */
  const fromBusiness = (
    requirement: TraceCell,
    business: ElementSnapshot | null,
    key: string,
  ) => {
    if (!business) {
      rows.push({
        key,
        cells: {
          requirement,
          business: cell([]),
          buc: empty,
          activity: empty,
          usecase: empty,
          screen: empty,
          information: empty,
        },
      });
      return;
    }
    reachedBusinesses.add(business.id);
    const flows = children(business, "buc");
    const upstream = { requirement, business: cell([business]) };
    if (flows.length === 0) fromFlow(upstream, null, `${key}/${business.id}`);
    for (const flow of flows) fromFlow(upstream, flow, `${key}/${business.id}`);
  };

  for (const requirement of ofKind("requirement")) {
    const businesses = children(requirement, "business");
    if (businesses.length === 0)
      fromBusiness(cell([requirement]), null, requirement.id);
    for (const business of businesses) {
      fromBusiness(cell([requirement]), business, requirement.id);
    }
  }
  // 要求につながらない業務、業務につながらない業務フローと活動、活動につながらないシステム操作も出す
  for (const business of ofKind("business")) {
    if (!reachedBusinesses.has(business.id))
      fromBusiness(cell([]), business, "-");
  }
  for (const flow of ofKind("buc")) {
    if (!reachedFlows.has(flow.id) && parents(flow, "business").length === 0) {
      fromFlow({ requirement: cell([]), business: cell([]) }, flow, "-/-");
    }
  }
  for (const activity of ofKind("activity")) {
    if (
      !reachedActivities.has(activity.id) &&
      parents(activity, "buc").length === 0
    ) {
      const usecases = children(activity, "usecase");
      for (const usecase of usecases) reachedUsecases.add(usecase.id);
      const base = {
        requirement: cell([]),
        business: cell([]),
        buc: cell([]),
        activity: cell([activity]),
      };
      if (usecases.length === 0) {
        rows.push({
          key: `-/-/-/${activity.id}`,
          cells: {
            ...base,
            usecase:
              activity.attributes.mode === "manual" ? note("手作業") : cell([]),
            screen: empty,
            information: empty,
          },
        });
      }
      for (const usecase of usecases) {
        rows.push({
          key: `-/-/-/${activity.id}/${usecase.id}`,
          cells: { ...base, ...usecaseCells(usecase) },
        });
      }
    }
  }
  for (const usecase of ofKind("usecase")) {
    if (
      !reachedUsecases.has(usecase.id) &&
      parents(usecase, "activity").length === 0
    ) {
      rows.push({
        key: `-/-/-/-/${usecase.id}`,
        cells: {
          requirement: cell([]),
          business: cell([]),
          buc: cell([]),
          activity: cell([]),
          ...usecaseCells(usecase),
        },
      });
    }
  }
  return rows;
}

/** セルを文字にする。並べ替えと絞り込みに使う */
export function cellText(cell: TraceCell): string {
  if (cell.note) return cell.note;
  return cell.elements.map((e) => e.name).join("、");
}

/** 行を絞り込み、列で並べ替える。途切れているセルは、並べ替えで最後に回す */
export function filterRows(
  rows: readonly TraceRow[],
  options: {
    readonly text: string;
    readonly gapsOnly: boolean;
    readonly sortBy: TraceColumn | null;
  },
): TraceRow[] {
  const text = options.text.trim();
  const filtered = rows.filter(
    (row) =>
      (!options.gapsOnly || Object.values(row.cells).some((c) => c.gap)) &&
      (text === "" ||
        Object.values(row.cells).some((c) => cellText(c).includes(text))),
  );
  const column = options.sortBy;
  if (!column) return filtered;
  return [...filtered].sort((a, b) => {
    const x = cellText(a.cells[column]);
    const y = cellText(b.cells[column]);
    if (x === "" || y === "") return x === y ? 0 : x === "" ? 1 : -1;
    return x.localeCompare(y, "ja");
  });
}
