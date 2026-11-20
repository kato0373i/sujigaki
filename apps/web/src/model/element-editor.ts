import {
  ATTRIBUTE_LABELS,
  type ElementKind,
  type ElementSnapshot,
  type JsonValue,
  jsonEqual,
} from "@sujigaki/domain";

/** 詳細パネルで編集する、種類ごとの属性の入力欄（FR-002、FR-003） */
export interface AttributeField {
  readonly key: string;
  readonly label: string;
  /**
   * text: 1行、textarea: 複数行、lines: 1行に1つずつの一覧、select: 選択肢、
   * items: 情報の項目。1行に1つずつ書き、説明は「：」のあとに書く
   */
  readonly input: "text" | "textarea" | "lines" | "select" | "items";
  readonly choices?: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}

const field = (
  key: string,
  input: AttributeField["input"],
  choices?: AttributeField["choices"],
): AttributeField => ({
  key,
  label: ATTRIBUTE_LABELS[key] ?? key,
  input,
  ...(choices && { choices }),
});

export const ATTRIBUTE_FIELDS: Partial<
  Record<ElementKind, readonly AttributeField[]>
> = {
  activity: [
    field("mode", "select", [
      { value: "manual", label: "手作業" },
      { value: "system", label: "システム利用" },
    ]),
    field("trigger", "text"),
    field("input", "text"),
    field("procedure", "textarea"),
    field("exceptions", "lines"),
    field("outcome", "text"),
  ],
  requirement: [
    field("priority", "select", [
      { value: "must", label: "Must（必須）" },
      { value: "should", label: "Should（推奨）" },
      { value: "could", label: "Could（任意）" },
    ]),
    field("rationale", "textarea"),
    field("origin", "text"),
    field("originalText", "textarea"),
  ],
  state: [field("stereotype", "text")],
  information: [field("items", "items")],
  variation: [field("values", "lines")],
};

export interface Item {
  readonly name: string;
  readonly description?: string;
}

/** 情報の項目を、入力欄の1行にする */
export function itemLine(item: Item): string {
  return item.description ? `${item.name}：${item.description}` : item.name;
}

/** 入力欄の1行を情報の項目にする。説明は最初の「：」（半角の「:」も可）のあと */
export function parseItem(line: string): Item {
  const at = line.search(/[：:]/);
  if (at < 0) return { name: line };
  const name = line.slice(0, at).trim();
  const description = line.slice(at + 1).trim();
  return description === "" ? { name } : { name, description };
}

/** 入力中の内容。属性は入力欄の文字列のまま持つ */
export interface Draft {
  readonly name: string;
  readonly summary: string;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface ContentChanges {
  readonly name?: string;
  readonly summary?: string;
  readonly attributes?: Record<string, JsonValue>;
}

export function draftOf(element: ElementSnapshot): Draft {
  const attributes: Record<string, string> = {};
  for (const f of ATTRIBUTE_FIELDS[element.kind] ?? []) {
    const value = element.attributes[f.key];
    attributes[f.key] = Array.isArray(value)
      ? value
          .map((v) => (typeof v === "string" ? v : itemLine(v as Item)))
          .join("\n")
      : typeof value === "string"
        ? value
        : "";
  }
  return { name: element.name, summary: element.summary, attributes };
}

/** 入力中の内容を、要素の属性の形にする。空の項目は持たない */
function attributesOf(
  element: ElementSnapshot,
  draft: Draft,
): Record<string, JsonValue> {
  const fields = ATTRIBUTE_FIELDS[element.kind] ?? [];
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(element.attributes)) {
    if (!fields.some((f) => f.key === key)) result[key] = value;
  }
  for (const f of fields) {
    const text = draft.attributes[f.key] ?? "";
    if (f.input === "lines" || f.input === "items") {
      const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
      if (lines.length > 0) {
        result[f.key] =
          f.input === "items"
            ? lines.map((line) => parseItem(line) as unknown as JsonValue)
            : lines;
      }
    } else if (text.trim() !== "") {
      result[f.key] = text.trim();
    }
  }
  return result;
}

/** 保存する変更。今の内容と同じ項目は送らない。何も変わらなければ null */
export function changesOf(
  element: ElementSnapshot,
  draft: Draft,
): ContentChanges | null {
  const changes: { -readonly [K in keyof ContentChanges]: ContentChanges[K] } =
    {};
  if (draft.name.trim() !== element.name) changes.name = draft.name;
  if (draft.summary !== element.summary) changes.summary = draft.summary;
  const attributes = attributesOf(element, draft);
  if (!jsonEqual(attributes, element.attributes))
    changes.attributes = attributes;
  return Object.keys(changes).length > 0 ? changes : null;
}

/** 保存すると未レビューに戻るか（FR-013）。外部リンクだけの変更では戻らない */
export function resetsReview(
  element: ElementSnapshot,
  changes: ContentChanges | null,
): boolean {
  return changes !== null && element.reviewState !== "unreviewed";
}

export interface ConflictRow {
  readonly label: string;
  readonly mine: string;
  readonly current: string;
}

/**
 * 衝突のダイアログ（D-01）に出す行。自分が変えた項目ごとに、自分の内容と今の内容を並べる。
 * 違う行は強調する
 */
export function conflictRows(
  changes: ContentChanges,
  current: ElementSnapshot,
): (ConflictRow & { readonly differs: boolean })[] {
  const rows: ConflictRow[] = [];
  if (changes.name !== undefined) {
    rows.push({ label: "名前", mine: changes.name, current: current.name });
  }
  if (changes.summary !== undefined) {
    rows.push({
      label: "要約",
      mine: changes.summary,
      current: current.summary,
    });
  }
  if (changes.attributes) {
    const keys = new Set([
      ...Object.keys(changes.attributes),
      ...Object.keys(current.attributes),
    ]);
    const fields = ATTRIBUTE_FIELDS[current.kind] ?? [];
    for (const key of keys) {
      const choices = fields.find((f) => f.key === key)?.choices ?? [];
      // 選択肢の値は、画面に出している表示名にする
      const shown = (value: JsonValue | undefined) =>
        choices.find((c) => c.value === value)?.label ?? text(value);
      rows.push({
        label: ATTRIBUTE_LABELS[key] ?? key,
        mine: shown(changes.attributes[key]),
        current: shown(current.attributes[key]),
      });
    }
  }
  return rows.map((row) => ({ ...row, differs: row.mine !== row.current }));
}

function text(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map((v) => text(v)).join("\n");
  return typeof value === "string" ? value : JSON.stringify(value);
}
