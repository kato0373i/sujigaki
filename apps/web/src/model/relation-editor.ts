import {
  connectableKinds,
  ELEMENT_KIND_LABELS,
  type ElementKind,
  type ElementSnapshot,
  RELATION_TYPES,
  resolveRelation,
} from "@sujigaki/domain";

/** 詳細パネルに出すつながり。自分が持つつながりと、ほかの要素から自分へのつながりの両方を出す */
export interface RelationRow {
  readonly key: string;
  /** つながりの相手。見つからなければ null */
  readonly other: ElementSnapshot | null;
  readonly kindLabel: string;
  /** つながりを持つ要素（設計書 ADR-004）。外すときは、この要素のバージョンを付ける */
  readonly owner: ElementSnapshot;
  readonly relationId: string;
}

/** 向きのあるつながり（#arrow）なら、「次の活動」「前の活動」のように向きを添える（#123） */
function directed(typeId: string, label: string, prefix: string): string {
  const tag = RELATION_TYPES.find((t) => t.id === typeId)?.tag;
  return tag === "#arrow" ? `${prefix}${label}` : label;
}

export function relationRows(
  element: ElementSnapshot,
  elements: readonly ElementSnapshot[],
): RelationRow[] {
  const active = elements.filter((e) => e.deletedAt === null);
  const byId = new Map(active.map((e) => [e.id as string, e]));
  const outgoing = element.relations.map((r) => ({
    key: `out-${r.id}`,
    other: byId.get(r.to) ?? null,
    kindLabel: directed(r.typeId, ELEMENT_KIND_LABELS[r.toKind], "次の"),
    owner: element,
    relationId: r.id,
  }));
  const incoming = active.flatMap((owner) =>
    owner.relations
      .filter((r) => r.to === element.id)
      .map((r) => ({
        key: `in-${owner.id}-${r.id}`,
        other: owner,
        kindLabel: directed(r.typeId, ELEMENT_KIND_LABELS[owner.kind], "前の"),
        owner,
        relationId: r.id,
      })),
  );
  return [...outgoing, ...incoming].sort((a, b) =>
    a.kindLabel === b.kindLabel
      ? (a.other?.name ?? "").localeCompare(b.other?.name ?? "", "ja")
      : a.kindLabel.localeCompare(b.kindLabel, "ja"),
  );
}

export interface RelationCandidate {
  readonly element: ElementSnapshot;
  readonly kindLabel: string;
  /** つながりを相手の側で持つか。相手の要素からつなぐ */
  readonly reversed: boolean;
}

/**
 * 「＋ つなぐ」の候補（FR-001、FR-010）。つなげる種類の要素だけを、名前で絞って出す。
 * 自分自身と、すでにつながっている要素は出さない
 */
export function relationCandidates(
  element: ElementSnapshot,
  elements: readonly ElementSnapshot[],
  query: string,
  limit = 10,
): RelationCandidate[] {
  const kinds = new Set(connectableKinds(element.kind));
  const connected = new Set(
    relationRows(element, elements).map((r) => r.other?.id),
  );
  const text = query.trim();
  return elements
    .filter(
      (e) =>
        e.deletedAt === null &&
        e.id !== element.id &&
        kinds.has(e.kind) &&
        !connected.has(e.id) &&
        e.name.includes(text),
    )
    .flatMap((e): RelationCandidate[] => {
      const resolved = resolveRelation(element.kind, e.kind);
      return resolved.ok
        ? [
            {
              element: e,
              kindLabel: ELEMENT_KIND_LABELS[e.kind],
              reversed: resolved.reversed,
            },
          ]
        : [];
    })
    .sort((a, b) =>
      a.kindLabel === b.kindLabel
        ? a.element.name.localeCompare(b.element.name, "ja")
        : a.kindLabel.localeCompare(b.kindLabel, "ja"),
    )
    .slice(0, limit);
}

/** 削除するとつながりが表示から消える要素（D-02、FR-012）。同じ要素と2つ以上つながっていても、1つにまとめる */
export function connectedElements(
  element: ElementSnapshot,
  elements: readonly ElementSnapshot[],
): { readonly element: ElementSnapshot; readonly kindLabel: string }[] {
  const seen = new Set<string>();
  return relationRows(element, elements).flatMap((row) => {
    if (!row.other || row.other.id === element.id || seen.has(row.other.id))
      return [];
    seen.add(row.other.id);
    return [
      {
        element: row.other,
        kindLabel: ELEMENT_KIND_LABELS[row.other.kind],
      },
    ];
  });
}

/** 「＋ つなぐ」で新しく作れる種類（P-01、FR-010）。相手の側でつながりを持つ種類は reversed にする */
export function creatableKinds(element: ElementSnapshot): {
  readonly kind: ElementKind;
  readonly label: string;
  readonly reversed: boolean;
}[] {
  return connectableKinds(element.kind).flatMap((kind) => {
    const resolved = resolveRelation(element.kind, kind);
    return resolved.ok
      ? [
          {
            kind,
            label: ELEMENT_KIND_LABELS[kind],
            reversed: resolved.reversed,
          },
        ]
      : [];
  });
}
