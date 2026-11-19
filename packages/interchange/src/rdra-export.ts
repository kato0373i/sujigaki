import {
  ELEMENT_KIND_LABELS,
  type ElementKind,
  type ElementSnapshot,
  type InformationAttributes,
  RELATION_TYPES,
  type StateAttributes,
  type VariationAttributes,
} from "@sujigaki/domain";

/** 関連データに書く種類の名前（要件定義書 4.1 節の RDRA の要素）。要求は関連データにない */
export const RDRA_KIND_NAMES: Readonly<
  Record<Exclude<ElementKind, "requirement">, string>
> = {
  actor: "アクター",
  actorGroup: "アクター群",
  externalSystem: "外部システム",
  externalSystemGroup: "外部システム群",
  business: "業務",
  buc: "BUC",
  activity: "アクティビティ",
  usecase: "UC",
  screen: "画面",
  event: "イベント",
  timer: "タイマー",
  context: "コンテキスト",
  information: "情報",
  stateModel: "状態モデル",
  state: "状態",
  condition: "条件",
  variation: "バリエーション",
};

/** 要約を #comment の行に書く種類。調査メモの関係の一覧の順 */
const COMMENT_KINDS = [
  "activity",
  "usecase",
  "information",
  "state",
  "stateModel",
  "actor",
  "externalSystem",
  "condition",
  "variation",
] as const;

/** 書き出しの前に知らせること（設計書 5.8 節）。知らせても書き出しは止めない */
export type RelatedDataWarning =
  | {
      readonly type: "duplicateName";
      readonly kindLabel: string;
      readonly name: string;
      readonly count: number;
    }
  | {
      readonly type: "replacedText";
      readonly elementId: string;
      readonly kindLabel: string;
      readonly name: string;
    }
  | {
      readonly type: "notExported";
      readonly elementId: string;
      readonly kindLabel: string;
      readonly name: string;
    };

export interface RelatedDataExport {
  readonly text: string;
  readonly warnings: readonly RelatedDataWarning[];
}

/** タブと改行は空白に、区切りの文字は全角に置き換える */
function clean(text: string): string {
  return text
    .replace(/[\t\r\n]+/g, " ")
    .replaceAll("@@", "＠＠")
    .replaceAll("//", "／／");
}

interface Row {
  readonly tag: string;
  readonly from: string;
  readonly to: string;
  readonly pairs: readonly (readonly [ElementSnapshot, string])[];
}

/**
 * モデルを RDRA の関連データ形式で書き出す（FR-051、設計書 5.8 節）。
 * 削除済みの要素、要求とそのつながり、このツール独自の属性は書かない
 */
export function exportRelatedData(
  systemName: string,
  elements: readonly ElementSnapshot[],
): RelatedDataExport {
  const active = elements.filter(
    (e) => e.deletedAt === null && e.kind !== "requirement",
  );
  const byId = new Map(active.map((e) => [e.id as string, e]));
  const replaced = new Set<string>();
  const appeared = new Set<string>();
  const name = (e: ElementSnapshot) => {
    const text = clean(e.name);
    if (text !== e.name) replaced.add(e.id);
    return text;
  };
  const value = (e: ElementSnapshot, text: string) => {
    const cleaned = clean(text);
    if (cleaned !== text) replaced.add(e.id);
    return cleaned;
  };
  const kindName = (kind: ElementKind) =>
    RDRA_KIND_NAMES[kind as Exclude<ElementKind, "requirement">];

  const rows: Row[] = [];
  for (const type of RELATION_TYPES) {
    if (type.tag === null) continue;
    const pairs = active.flatMap((from) =>
      from.kind !== type.from
        ? []
        : from.relations.flatMap((r) => {
            const to = r.typeId === type.id ? byId.get(r.to) : undefined;
            if (!to) return [];
            appeared.add(to.id);
            return [[from, `${name(from)}@@${name(to)}`] as const];
          }),
    );
    rows.push({
      tag: type.tag,
      from: kindName(type.from),
      to: kindName(type.to),
      pairs,
    });
  }
  const attributeRow = (
    kind: "information" | "variation",
    label: string,
    values: (e: ElementSnapshot) => readonly string[],
  ): Row => ({
    tag: "#attribute",
    from: kindName(kind),
    to: label,
    pairs: active
      .filter((e) => e.kind === kind)
      .flatMap((e) =>
        values(e).map((v) => [e, `${name(e)}@@${value(e, v)}`] as const),
      ),
  });
  rows.push(
    attributeRow("information", "属性", (e) =>
      ((e.attributes as InformationAttributes).items ?? []).map((i) => i.name),
    ),
    attributeRow(
      "variation",
      "値",
      (e) => (e.attributes as VariationAttributes).values ?? [],
    ),
  );
  for (const kind of COMMENT_KINDS) {
    rows.push({
      tag: "#comment",
      from: kindName(kind),
      to: "説明",
      pairs: active
        .filter((e) => e.kind === kind && e.summary.trim() !== "")
        .map((e) => [e, `${name(e)}@@${value(e, e.summary)}`] as const),
    });
  }
  rows.push({
    tag: "#stereotype",
    from: kindName("state"),
    to: "Stereotype",
    pairs: active.flatMap((e) => {
      const stereotype = (e.attributes as StateAttributes).stereotype;
      return e.kind === "state" && stereotype
        ? [[e, `${name(e)}@@${value(e, stereotype)}`] as const]
        : [];
    }),
  });

  const lines = rows.flatMap((row) => {
    const texts = [...new Set(row.pairs.map(([, text]) => text))].sort((a, b) =>
      a.localeCompare(b, "ja"),
    );
    for (const [from] of row.pairs) appeared.add(from.id);
    return texts.length === 0
      ? []
      : [[row.tag, row.from, row.to, texts.join("//")].join("\t")];
  });

  return {
    text: `${[clean(systemName), ...lines].join("\n")}\n`,
    warnings: [
      ...duplicateNames(active),
      ...active
        .filter((e) => replaced.has(e.id))
        .map((e) => warning("replacedText", e)),
      ...active
        .filter((e) => !appeared.has(e.id))
        .map((e) => warning("notExported", e)),
    ],
  };
}

function warning(
  type: "replacedText" | "notExported",
  e: ElementSnapshot,
): RelatedDataWarning {
  return {
    type,
    elementId: e.id,
    kindLabel: ELEMENT_KIND_LABELS[e.kind],
    name: e.name,
  };
}

/** 要素は名前で識別されるため、同じ種類で名前が重なる要素を知らせる。状態は状態の流れを問わない */
function duplicateNames(
  active: readonly ElementSnapshot[],
): RelatedDataWarning[] {
  const counts = new Map<
    string,
    { kind: ElementKind; name: string; count: number }
  >();
  for (const e of active) {
    const key = `${e.kind}\n${e.name}`;
    const entry = counts.get(key) ?? { kind: e.kind, name: e.name, count: 0 };
    counts.set(key, { ...entry, count: entry.count + 1 });
  }
  return [...counts.values()]
    .filter((c) => c.count > 1)
    .map((c) => ({
      type: "duplicateName" as const,
      kindLabel: ELEMENT_KIND_LABELS[c.kind],
      name: c.name,
      count: c.count,
    }));
}
