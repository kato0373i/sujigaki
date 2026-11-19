import {
  type Attributes,
  ELEMENT_KIND_LABELS,
  type ElementId,
  type ElementKind,
  type ElementSnapshot,
  type InformationAttributes,
  RELATION_TYPES,
  type Relation,
  type RelationId,
} from "@sujigaki/domain";
import {
  COMMENT_KINDS,
  exportRelatedData,
  RDRA_KIND_NAMES,
} from "./rdra-export.ts";
import type { ReadIssue } from "./yaml-codec.ts";

/** 関連データから読み込んだ要素に付ける出所（FR-052） */
export const RELATED_DATA_SOURCE = "RDRA 読み込み";

type RdraKind = Exclude<ElementKind, "requirement">;

/** 行のタグと種類の組が表すもの（設計書 5.8 節の行） */
type RowSpec =
  | {
      readonly type: "relation";
      readonly typeId: string;
      readonly from: RdraKind;
      readonly to: RdraKind;
    }
  | {
      readonly type: "items" | "values" | "summary" | "stereotype";
      readonly from: RdraKind;
    };

const KIND_BY_NAME = new Map(
  (Object.entries(RDRA_KIND_NAMES) as [RdraKind, string][]).map(
    ([kind, name]) => [name, kind],
  ),
);

function rowSpec(tag: string, from: string, to: string): RowSpec | null {
  const fromKind = KIND_BY_NAME.get(from);
  if (!fromKind) return null;
  if (tag === "#attribute") {
    if (fromKind === "information" && to === "属性")
      return { type: "items", from: fromKind };
    if (fromKind === "variation" && to === "値")
      return { type: "values", from: fromKind };
    return null;
  }
  if (tag === "#comment") {
    return to === "説明" &&
      (COMMENT_KINDS as readonly string[]).includes(fromKind)
      ? { type: "summary", from: fromKind }
      : null;
  }
  if (tag === "#stereotype") {
    return fromKind === "state" && to === "Stereotype"
      ? { type: "stereotype", from: fromKind }
      : null;
  }
  const toKind = KIND_BY_NAME.get(to);
  const type = RELATION_TYPES.find(
    (t) => t.tag === tag && t.from === fromKind && t.to === toKind,
  );
  return type && toKind
    ? { type: "relation", typeId: type.id, from: fromKind, to: toKind }
    : null;
}

/** 関連データから集めた、1つの要素の内容 */
interface Draft {
  readonly kind: RdraKind;
  readonly name: string;
  /** はじめて出てきた行。対応づけられないときの行番号に使う */
  readonly line: number;
  readonly relations: { typeId: string; toKind: RdraKind; toName: string }[];
  summary?: string;
  items?: string[];
  values?: string[];
  stereotype?: string;
}

export type RelatedDataRead =
  | {
      readonly ok: true;
      /** 取り込んだあとの要素。今の要素と同じ ID を引き継ぐ。差分は diffElements で出す */
      readonly elements: readonly ElementSnapshot[];
    }
  | { readonly ok: false; readonly issues: readonly ReadIssue[] };

/**
 * RDRA の関連データを読み、取り込んだあとの要素を組み立てる（FR-052、設計書 5.9 節）。
 * 種類と名前が同じ今の要素は ID を引き継ぎ、関連データで表せる内容だけを合わせる
 */
export function readRelatedData(
  text: string,
  current: readonly ElementSnapshot[],
  at: Date,
  newId: () => string,
): RelatedDataRead {
  const issues: ReadIssue[] = [];
  const issue = (line: number, message: string) =>
    issues.push({ path: [], line, message });
  const drafts = new Map<string, Draft>();
  const draftOf = (kind: RdraKind, name: string, line: number): Draft => {
    const key = `${kind}\n${name}`;
    const found = drafts.get(key);
    if (found) return found;
    const draft: Draft = { kind, name, line, relations: [] };
    drafts.set(key, draft);
    return draft;
  };

  let seenRow = false;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (raw.trim() === "") return;
    if (!raw.startsWith("#")) {
      // 最初の行はシステム名。プロジェクトのシステム名は変えない
      if (!seenRow) {
        seenRow = true;
        return;
      }
      issue(line, "タグ（#child など）で始まらない行です。");
      return;
    }
    seenRow = true;
    const columns = raw.split("\t");
    if (columns.length < 3 || columns.length > 4) {
      issue(
        line,
        "列の数が合いません。タグ・元の種類・先の種類・名前の組の4列を、タブで区切ってください。",
      );
      return;
    }
    const [tag = "", from = "", to = "", pairs = ""] = columns;
    const spec = rowSpec(tag, from, to);
    if (!spec) {
      issue(
        line,
        `「${tag} ${from} → ${to}」の行は、関連データの形式にありません。`,
      );
      return;
    }
    for (const pair of pairs.split("//")) {
      if (pair.trim() === "") continue;
      const separator = pair.indexOf("@@");
      const left = separator < 0 ? "" : pair.slice(0, separator).trim();
      const right = separator < 0 ? "" : pair.slice(separator + 2).trim();
      if (left === "" || right === "") {
        issue(
          line,
          `「${pair}」は「元の名前@@先の名前」の形になっていません。`,
        );
        continue;
      }
      const draft = draftOf(spec.from, left, line);
      if (spec.type === "relation") {
        draftOf(spec.to, right, line);
        draft.relations.push({
          typeId: spec.typeId,
          toKind: spec.to,
          toName: right,
        });
      } else if (spec.type === "items") {
        draft.items = [...(draft.items ?? []), right];
      } else if (spec.type === "values") {
        draft.values = [...(draft.values ?? []), right];
      } else if (spec.type === "summary") {
        draft.summary = right;
      } else {
        draft.stereotype = right;
      }
    }
  });
  if (seenRow && drafts.size === 0 && issues.length === 0) {
    issue(1, "関連データに、要素の名前の組が1つもありません。");
  }
  if (!seenRow) issue(1, "関連データが空です。");
  if (issues.length > 0) return { ok: false, issues };

  // 種類と名前で、今の有効な要素と対応づける
  const active = current.filter((e) => e.deletedAt === null);
  const sameName = new Map<string, ElementSnapshot[]>();
  for (const e of active) {
    const key = `${e.kind}\n${e.name}`;
    sameName.set(key, [...(sameName.get(key) ?? []), e]);
  }
  const ids = new Map<string, ElementId>();
  const matched = new Map<string, ElementSnapshot>();
  for (const [key, draft] of drafts) {
    const candidates = sameName.get(key) ?? [];
    if (candidates.length > 1) {
      issue(
        draft.line,
        `今のモデルに、名前が「${draft.name}」の${ELEMENT_KIND_LABELS[draft.kind]}が${candidates.length}つあるため、対応づけられません。名前を変えてから読み込んでください。`,
      );
      continue;
    }
    const before = candidates[0];
    if (before) matched.set(key, before);
    ids.set(key, before?.id ?? (newId() as ElementId));
  }
  if (issues.length > 0) return { ok: false, issues };

  const now = at.toISOString();
  const imported = [...drafts].map(([key, draft]) => {
    const id = ids.get(key) as ElementId;
    const before = matched.get(key);
    const relations = draft.relations.map((r): Relation => {
      const to = ids.get(`${r.toKind}\n${r.toName}`) as ElementId;
      const kept = before?.relations.find(
        (old) => old.typeId === r.typeId && old.to === to,
      );
      return {
        id: kept?.id ?? (`${id}-${r.typeId}-${to}` as RelationId),
        typeId: r.typeId,
        to,
        toKind: r.toKind,
      };
    });
    const unique = [
      ...new Map(relations.map((r) => [`${r.typeId}\n${r.to}`, r])).values(),
    ];
    const keptRelations =
      before?.relations.filter(
        (r) => RELATION_TYPES.find((t) => t.id === r.typeId)?.tag === null,
      ) ?? [];
    const summary = (COMMENT_KINDS as readonly string[]).includes(draft.kind)
      ? (draft.summary ?? "")
      : (before?.summary ?? "");
    const element: ElementSnapshot = before
      ? {
          ...before,
          summary,
          attributes: attributesOf(draft, before.attributes),
          relations: [...keptRelations, ...unique],
        }
      : {
          id,
          kind: draft.kind,
          name: draft.name,
          summary,
          attributes: attributesOf(draft, {}),
          reviewState: "unreviewed",
          reviewedHash: null,
          authorType: "import",
          source: RELATED_DATA_SOURCE,
          version: 1,
          deletedAt: null,
          deletedBy: null,
          links: [],
          relations: unique,
          createdAt: now,
          createdBy: null,
          updatedAt: now,
          updatedBy: null,
        };
    return element;
  });

  // 今のモデルを書き出しても関連データに出てこない要素（要求、つながりのない要素）は、そのまま残す
  const notExported = new Set(
    exportRelatedData("", current)
      .warnings.filter((w) => w.type === "notExported")
      .map((w) => w.elementId),
  );
  const importedIds = new Set(imported.map((e) => e.id as string));
  const kept = active.filter(
    (e) =>
      !importedIds.has(e.id) &&
      (e.kind === "requirement" || notExported.has(e.id)),
  );
  return { ok: true, elements: [...kept, ...imported] };
}

/** 関連データで表せる属性だけを関連データに合わせ、ほかの属性は今のまま残す */
function attributesOf(draft: Draft, before: Attributes): Attributes {
  const { items, values, stereotype, ...rest } = before as Record<
    string,
    unknown
  >;
  if (draft.kind === "information") {
    const old = (before as InformationAttributes).items ?? [];
    return draft.items
      ? ({
          ...rest,
          items: draft.items.map(
            (name) => old.find((i) => i.name === name) ?? { name },
          ),
        } as Attributes)
      : (rest as Attributes);
  }
  if (draft.kind === "variation") {
    return (
      draft.values ? { ...rest, values: draft.values } : rest
    ) as Attributes;
  }
  if (draft.kind === "state") {
    return (
      draft.stereotype ? { ...rest, stereotype: draft.stereotype } : rest
    ) as Attributes;
  }
  return before;
}
