import type {
  ElementId,
  ElementSnapshot,
  LayoutSnapshot,
  Violation,
} from "@sujigaki/domain";

export type ActivityMode = "manual" | "system" | null;

export interface Lane {
  /** 担当者の要素の ID。担当者が未設定のレーンは null */
  readonly actorId: ElementId | null;
  readonly name: string;
}

export interface ActivityCard {
  readonly element: ElementSnapshot;
  readonly mode: ActivityMode;
  readonly laneIndex: number;
  readonly position: { readonly x: number; readonly y: number };
  /** つながっているシステム操作の名前 */
  readonly usecases: readonly string[];
  /** 表示していない種類の要素がつながっている数（FR-023） */
  readonly badges: readonly {
    readonly label: string;
    readonly count: number;
  }[];
  readonly violations: readonly Violation[];
}

export interface BusinessFlowView {
  readonly buc: ElementSnapshot;
  readonly lanes: readonly Lane[];
  readonly cards: readonly ActivityCard[];
  /** 活動から活動への流れ */
  readonly edges: readonly {
    readonly from: ElementId;
    readonly to: ElementId;
  }[];
}

export const COLUMN_WIDTH = 240;
export const LANE_HEIGHT = 120;
export const UNASSIGNED_LANE = "担当者が未設定";

const BADGE_KINDS = [
  { kind: "information", label: "情報" },
  { kind: "screen", label: "画面" },
  { kind: "timer", label: "定期処理" },
] as const;

/**
 * 業務フローの図に出す内容を計算する（画面設計書 S-04、FR-020）。
 * 担当者ごとにレーンを作り、活動を流れの順に左から並べる。担当者が未設定の活動は、いちばん下のレーンに置く。
 * 図の配置が保存してあれば、その横の位置を使う
 */
export function businessFlowView(
  elements: readonly ElementSnapshot[],
  bucId: string,
  layout: LayoutSnapshot | undefined,
  violations: readonly Violation[],
): BusinessFlowView | null {
  const active = new Map(
    elements
      .filter((e) => e.deletedAt === null)
      .map((e) => [e.id as string, e]),
  );
  const buc = active.get(bucId);
  if (buc?.kind !== "buc") return null;

  const activities = buc.relations
    .map((r) => active.get(r.to))
    .filter((e): e is ElementSnapshot => e?.kind === "activity");
  const ids = new Set(activities.map((a) => a.id));
  const edges = activities.flatMap((a) =>
    a.relations
      .filter((r) => r.toKind === "activity" && ids.has(r.to))
      .map((r) => ({ from: a.id, to: r.to })),
  );
  const rank = ranks(
    activities.map((a) => a.id),
    edges,
  );
  const ordered = [...activities].sort(
    (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
  );

  const actorOf = (activity: ElementSnapshot) =>
    activity.relations
      .map((r) => active.get(r.to))
      .find((e) => e?.kind === "actor");
  const lanes: Lane[] = [];
  for (const activity of ordered) {
    const actor = actorOf(activity);
    if (actor && !lanes.some((l) => l.actorId === actor.id)) {
      lanes.push({ actorId: actor.id, name: actor.name });
    }
  }
  lanes.push({ actorId: null, name: UNASSIGNED_LANE });

  const cards = ordered.map((activity): ActivityCard => {
    const actor = actorOf(activity);
    const laneIndex = lanes.findIndex((l) => l.actorId === (actor?.id ?? null));
    const related = activity.relations
      .map((r) => active.get(r.to))
      .filter((e): e is ElementSnapshot => e !== undefined);
    const saved = layout?.positions[activity.id];
    return {
      element: activity,
      mode: modeOf(activity),
      laneIndex,
      // 横の位置は保存した配置を使い、縦の位置は担当者のレーンで決める。レーンと担当者がずれないようにする
      position: {
        x: saved?.x ?? (rank.get(activity.id) ?? 0) * COLUMN_WIDTH,
        y: laneIndex * LANE_HEIGHT,
      },
      usecases: related.filter((e) => e.kind === "usecase").map((e) => e.name),
      badges: BADGE_KINDS.map(({ kind, label }) => ({
        label,
        count: related.filter((e) => e.kind === kind).length,
      })).filter((b) => b.count > 0),
      violations: violations.filter((v) => v.elementId === activity.id),
    };
  });
  return { buc, lanes, cards, edges };
}

function modeOf(activity: ElementSnapshot): ActivityMode {
  const mode = activity.attributes.mode;
  return mode === "manual" || mode === "system" ? mode : null;
}

/** 流れの順を、いちばん長い道のりの段数で決める。流れが輪になっていても止まる */
function ranks(
  ids: readonly ElementId[],
  edges: readonly { from: ElementId; to: ElementId }[],
): Map<ElementId, number> {
  const rank = new Map<ElementId, number>(ids.map((id) => [id, 0]));
  for (let round = 0; round < ids.length; round++) {
    let changed = false;
    for (const { from, to } of edges) {
      const next = (rank.get(from) ?? 0) + 1;
      if (next > (rank.get(to) ?? 0) && next < ids.length) {
        rank.set(to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return rank;
}

/** カードを横に動かしたあとの、業務フローのすべての活動の位置。図の配置として保存する（FR-020） */
export function positionsAfterMove(
  view: BusinessFlowView,
  movedId: string,
  x: number,
): Record<string, { x: number; y: number }> {
  return Object.fromEntries(
    view.cards.map((card) => [
      card.element.id,
      {
        x: Math.round(card.element.id === movedId ? x : card.position.x),
        y: card.position.y,
      },
    ]),
  );
}
