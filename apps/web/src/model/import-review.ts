import {
  type Actor,
  ATTRIBUTE_LABELS,
  can,
  ELEMENT_KIND_LABELS,
  type ElementSnapshot,
  type JsonValue,
} from "@sujigaki/domain";
import type { ContentField, ImportChange } from "@sujigaki/interchange";
import { ATTRIBUTE_FIELDS } from "./element-editor.ts";

export const CHANGE_TYPE_LABELS = {
  add: "追加",
  update: "変更",
  remove: "削除",
} as const;

/** 差分の1行に出す、項目ごとの今の内容と取り込む内容 */
export interface FieldDifference {
  readonly label: string;
  readonly before: string;
  readonly after: string;
}

export interface ChangeRow {
  readonly key: string;
  readonly change: ImportChange;
  readonly name: string;
  readonly kindLabel: string;
  readonly differences: readonly FieldDifference[];
}

const FIELD_LABELS: Readonly<
  Record<Exclude<ContentField, "attributes">, string>
> = {
  name: "名前",
  summary: "要約",
  links: "外部リンク",
  relations: "つながり",
};

function text(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map((v) => text(v)).join("、");
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * 取り込みの差分を、画面に出す行にする（画面設計書 S-08、S-09）。
 * 変更は項目ごとに今の内容と取り込む内容を並べる。つながりは先の要素の名前で出す
 */
export function changeRows(
  changes: readonly ImportChange[],
  known: readonly ElementSnapshot[],
): ChangeRow[] {
  const names = new Map(known.map((e) => [e.id as string, e.name]));
  const relationText = (element: ElementSnapshot) =>
    element.relations
      .map(
        (r) => `${ELEMENT_KIND_LABELS[r.toKind]}「${names.get(r.to) ?? r.to}」`,
      )
      .sort()
      .join("、");

  return changes.map((change): ChangeRow => {
    if (change.type === "add") {
      return {
        key: `add-${change.element.id}`,
        change,
        name: change.element.name,
        kindLabel: ELEMENT_KIND_LABELS[change.element.kind],
        differences: [],
      };
    }
    if (change.type === "remove") {
      return {
        key: `remove-${change.elementId}`,
        change,
        name: change.before.name,
        kindLabel: ELEMENT_KIND_LABELS[change.before.kind],
        differences: [],
      };
    }
    const { before, after } = change;
    const differences: FieldDifference[] = change.fields.flatMap((field) => {
      if (field === "attributes") {
        const keys = new Set([
          ...Object.keys(before.attributes),
          ...Object.keys(after.attributes),
        ]);
        return [...keys]
          .filter(
            (key) =>
              text(before.attributes[key]) !== text(after.attributes[key]),
          )
          .map((key) => {
            // 選択肢の値は、画面に出している表示名にする
            const choices =
              ATTRIBUTE_FIELDS[after.kind]?.find((f) => f.key === key)
                ?.choices ?? [];
            const shown = (value: JsonValue | undefined) =>
              choices.find((c) => c.value === value)?.label ?? text(value);
            return {
              label: ATTRIBUTE_LABELS[key] ?? key,
              before: shown(before.attributes[key]),
              after: shown(after.attributes[key]),
            };
          });
      }
      if (field === "relations") {
        return [
          {
            label: FIELD_LABELS.relations,
            before: relationText(before),
            after: relationText(after),
          },
        ];
      }
      if (field === "links") {
        const links = (e: ElementSnapshot) =>
          e.links.map((l) => l.label ?? l.url).join("、");
        return [
          {
            label: FIELD_LABELS.links,
            before: links(before),
            after: links(after),
          },
        ];
      }
      return [
        {
          label: FIELD_LABELS[field],
          before: before[field],
          after: after[field],
        },
      ];
    });
    return {
      key: `update-${change.elementId}`,
      change,
      name: after.name,
      kindLabel: ELEMENT_KIND_LABELS[after.kind],
      differences: change.restores
        ? [
            { label: "削除", before: "削除済み", after: "復元する" },
            ...differences,
          ]
        : differences,
    };
  });
}

/** 画面から送る要素の内容（設計書 5.6 節）。確認状態・バージョン・日時は送らない */
function elementInput(element: ElementSnapshot) {
  return {
    id: element.id,
    kind: element.kind,
    name: element.name,
    summary: element.summary,
    attributes: element.attributes,
    links: element.links,
    relations: element.relations.map((r) => ({
      id: r.id,
      typeId: r.typeId,
      to: r.to,
    })),
  };
}

/** 採用した変更を、変更の一式の API（POST /change-sets）の本文にする */
export function changeSetBody(
  changes: readonly ImportChange[],
  origin: { readonly authorType: "ai" | "import"; readonly source: string },
) {
  return {
    origin,
    changes: changes.map((change) =>
      change.type === "add"
        ? { type: "add", element: elementInput(change.element) }
        : change.type === "update"
          ? {
              type: "update",
              baseVersion: change.baseVersion,
              element: elementInput(change.after),
            }
          : {
              type: "remove",
              elementId: change.elementId,
              baseVersion: change.baseVersion,
            },
    ),
  };
}

/** 復元の前に出す、確認状態が保たれるかどうかの説明（FR-050） */
export function restoreNotice(actor: Actor): string {
  return can(actor, "restoreWithReviewState")
    ? "確認状態はファイルのとおりに保たれます。"
    : "業務責任者以上でないため、すべての要素が未レビューになります。";
}
