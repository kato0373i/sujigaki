import {
  ELEMENT_KIND_LABELS,
  ELEMENT_KINDS,
  type ElementKind,
  type ElementSnapshot,
} from "@sujigaki/domain";

/** 表示の設定のプリセット（画面設計書 7章、FR-022） */
export const VIEW_PRESETS = {
  flow: {
    label: "業務の流れ",
    kinds: ["requirement", "business", "activity", "usecase"],
  },
  screens: {
    label: "画面と情報",
    kinds: ["usecase", "screen", "event", "information"],
  },
  all: { label: "すべて", kinds: [...ELEMENT_KINDS] },
} as const satisfies Record<
  string,
  { label: string; kinds: readonly ElementKind[] }
>;

export type ViewPreset = keyof typeof VIEW_PRESETS;

/** 列の順。左から要求・業務・業務フロー・活動・システム操作・画面と情報。ほかの種類は右の列に出す */
const COLUMN_OF: Partial<Record<ElementKind, number>> = {
  requirement: 0,
  business: 1,
  buc: 2,
  activity: 3,
  usecase: 4,
  screen: 5,
  information: 5,
};
export const OTHER_COLUMN = 6;

export function columnOf(kind: ElementKind): number {
  return COLUMN_OF[kind] ?? OTHER_COLUMN;
}

export const DEFAULT_DEPTH = 2;
export const MAX_NODES = 200;

export interface ChainNode {
  readonly element: ElementSnapshot;
  /** 起点からの段数。表示していない種類の要素は数えない */
  readonly depth: number;
  readonly column: number;
  /** 表示していない種類の要素が、直接つながっている数（FR-023） */
  readonly hidden: readonly {
    readonly kind: ElementKind;
    readonly label: string;
    readonly count: number;
  }[];
}

export interface ChainView {
  readonly origin: ElementSnapshot;
  readonly nodes: readonly ChainNode[];
  /** 表示する要素どうしのつながり。表示していない要素を挟むときは、挟んだ先とつなぐ */
  readonly edges: readonly { readonly from: string; readonly to: string }[];
  /** 200件を超えて描かなかった要素の数（NFR-002） */
  readonly omitted: number;
}

/** つながりを向きを持たない隣り合いにする。削除済みの要素は含めない */
function neighbors(
  elements: readonly ElementSnapshot[],
): Map<string, Set<string>> {
  const active = new Set(
    elements.filter((e) => e.deletedAt === null).map((e) => e.id as string),
  );
  const map = new Map<string, Set<string>>(
    [...active].map((id) => [id, new Set()]),
  );
  for (const element of elements) {
    if (!active.has(element.id)) continue;
    for (const r of element.relations) {
      if (!active.has(r.to) || r.to === element.id) continue;
      map.get(element.id)?.add(r.to);
      map.get(r.to)?.add(element.id);
    }
  }
  return map;
}

/**
 * 連鎖ビューに描く内容を計算する（FR-021）。起点から、表示する種類の要素を数えて前後 depth 段までをたどる。
 * 表示していない種類の要素は、段数に数えずに通り抜ける。業務の流れのプリセットでも、業務と活動が業務フローを挟んでつながるようにするためである
 */
export function chainView(
  elements: readonly ElementSnapshot[],
  originId: string,
  depth: number,
  visible: ReadonlySet<ElementKind>,
  limit = MAX_NODES,
): ChainView | null {
  const byId = new Map(elements.map((e) => [e.id as string, e]));
  const origin = byId.get(originId);
  if (!origin || origin.deletedAt !== null) return null;
  const graph = neighbors(elements);
  const shows = (id: string) =>
    id === originId || visible.has(byId.get(id)?.kind ?? "actor");

  // 表示する要素だけを段数に数える幅優先の探索。表示しない要素は同じ段のまま通り抜ける
  const distance = new Map<string, number>([[originId, 0]]);
  const queue: string[] = [originId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const d = distance.get(current) ?? 0;
    for (const next of graph.get(current) ?? []) {
      const nd = shows(next) ? d + 1 : d;
      if (nd > depth || (distance.get(next) ?? Number.POSITIVE_INFINITY) <= nd)
        continue;
      distance.set(next, nd);
      // 段数の少ない経路を先に調べる
      if (shows(next)) queue.push(next);
      else queue.unshift(next);
    }
  }

  const reached = [...distance.keys()].filter(shows);
  reached.sort((a, b) => (distance.get(a) ?? 0) - (distance.get(b) ?? 0));
  const drawn = reached.slice(0, limit);
  const drawnSet = new Set(drawn);

  // 表示する要素どうしを、表示しない要素を挟んでもつなぐ
  const edges = new Map<string, { from: string; to: string }>();
  for (const from of drawn) {
    const seen = new Set<string>([from]);
    const stack = [...(graph.get(from) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop() as string;
      if (seen.has(next)) continue;
      seen.add(next);
      if (shows(next)) {
        if (drawnSet.has(next)) {
          const [a, b] = [from, next].sort();
          edges.set(`${a}\n${b}`, { from: a as string, to: b as string });
        }
      } else if (distance.has(next)) {
        stack.push(...(graph.get(next) ?? []));
      }
    }
  }

  const nodes = drawn.map((id): ChainNode => {
    const element = byId.get(id) as ElementSnapshot;
    const counts = new Map<ElementKind, number>();
    for (const n of graph.get(id) ?? []) {
      const kind = byId.get(n)?.kind;
      if (kind && !visible.has(kind))
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return {
      element,
      depth: distance.get(id) ?? 0,
      column: columnOf(element.kind),
      hidden: [...counts].map(([kind, count]) => ({
        kind,
        label: ELEMENT_KIND_LABELS[kind],
        count,
      })),
    };
  });
  return {
    origin,
    nodes,
    edges: [...edges.values()],
    omitted: reached.length - drawn.length,
  };
}

/**
 * 選んだ要素から要求までの経路と、画面・情報までの経路を求める（画面設計書 S-05）。
 * 左の列へ向かうつながりと、右の列へ向かうつながりを、それぞれ同じ向きにたどる
 */
export function highlightedPath(
  view: ChainView,
  selectedId: string,
): {
  readonly nodes: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
} {
  const column = new Map(
    view.nodes.map((n) => [n.element.id as string, n.column]),
  );
  const adjacent = new Map<string, string[]>();
  for (const { from, to } of view.edges) {
    adjacent.set(from, [...(adjacent.get(from) ?? []), to]);
    adjacent.set(to, [...(adjacent.get(to) ?? []), from]);
  }
  const nodes = new Set<string>([selectedId]);
  const edges = new Set<string>();
  const walk = (start: string, toward: -1 | 1) => {
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      const here = column.get(current) ?? OTHER_COLUMN;
      for (const next of adjacent.get(current) ?? []) {
        const there = column.get(next) ?? OTHER_COLUMN;
        if (there === OTHER_COLUMN || Math.sign(there - here) !== toward)
          continue;
        edges.add([current, next].sort().join("\n"));
        if (!nodes.has(next)) {
          nodes.add(next);
          stack.push(next);
        }
      }
    }
  };
  walk(selectedId, -1);
  walk(selectedId, 1);
  return { nodes, edges };
}
