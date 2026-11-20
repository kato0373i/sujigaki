import {
  type ElementSnapshot,
  REVIEW_STATES,
  type ReviewState,
} from "@sujigaki/domain";

export interface BusinessRow {
  /** 業務。どの業務にも属さない業務フローの行は null */
  readonly business: ElementSnapshot | null;
  readonly flows: readonly ElementSnapshot[];
  /** 業務フローごとの、削除されていない活動の数（#159） */
  readonly activities: Readonly<Record<string, number>>;
  /** 業務とその下の業務フロー・活動の、確認状態ごとの数 */
  readonly counts: Readonly<Record<ReviewState, number>>;
}

/** 業務一覧に出す内容を計算する（画面設計書 S-03）。業務も業務フローも名前の順に並べる */
export function businessListView(
  elements: readonly ElementSnapshot[],
): BusinessRow[] {
  const active = elements.filter((e) => e.deletedAt === null);
  const byId = new Map(active.map((e) => [e.id as string, e]));
  const children = (parent: ElementSnapshot, kind: ElementSnapshot["kind"]) =>
    parent.relations
      .map((r) => byId.get(r.to))
      .filter((e): e is ElementSnapshot => e?.kind === kind)
      .sort(byName);

  const activityCounts = (flows: readonly ElementSnapshot[]) =>
    Object.fromEntries(
      flows.map((f) => [f.id as string, children(f, "activity").length]),
    );
  const assigned = new Set<string>();
  const rows: BusinessRow[] = active
    .filter((e) => e.kind === "business")
    .sort(byName)
    .map((business) => {
      const flows = children(business, "buc");
      for (const flow of flows) assigned.add(flow.id);
      const members = [
        business,
        ...flows,
        ...flows.flatMap((f) => children(f, "activity")),
      ];
      return {
        business,
        flows,
        activities: activityCounts(flows),
        counts: countByState(members),
      };
    });

  const unassigned = active
    .filter((e) => e.kind === "buc" && !assigned.has(e.id))
    .sort(byName);
  if (unassigned.length > 0) {
    const members = [
      ...unassigned,
      ...unassigned.flatMap((f) => children(f, "activity")),
    ];
    rows.push({
      business: null,
      flows: unassigned,
      activities: activityCounts(unassigned),
      counts: countByState(members),
    });
  }
  return rows;
}

function byName(a: ElementSnapshot, b: ElementSnapshot) {
  return a.name.localeCompare(b.name, "ja");
}

function countByState(elements: readonly ElementSnapshot[]) {
  const counts = Object.fromEntries(REVIEW_STATES.map((s) => [s, 0])) as Record<
    ReviewState,
    number
  >;
  for (const element of new Set(elements)) counts[element.reviewState] += 1;
  return counts;
}
