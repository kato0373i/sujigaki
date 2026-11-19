import {
  ATTRIBUTE_LABELS,
  blankQuestions,
  ELEMENT_KIND_LABELS,
  type ElementKind,
  type ElementSnapshot,
  type QuestionSnapshot,
  RELATION_TYPES,
} from "@sujigaki/domain";
import { stringify } from "yaml";
import { PROPOSAL_FORMAT } from "./ai-proposal.ts";

/** AI に渡す範囲（FR-033） */
export type AiScope =
  | { readonly type: "business"; readonly id: string }
  | { readonly type: "flow"; readonly id: string }
  | { readonly type: "element"; readonly id: string };

/** 用途のテンプレート（画面設計書 S-08） */
export const AI_TEMPLATES = {
  draft: {
    label: "下書きの作成",
    request:
      "範囲の業務について、足りない活動・システム操作・画面・情報の下書きを作ってください。新しい要素と、直した既存の要素を、返答の形式の elements に書いてください。",
  },
  gaps: {
    label: "抜け漏れの指摘",
    request:
      "範囲の要素について、つながりや属性の抜け漏れを見つけてください。直した要素を返答の形式の elements に書き、確かめたいことは questions に書いてください。",
  },
  questions: {
    label: "質問の作成",
    request:
      "範囲の要素について、業務の担当者に確かめるべき質問を作ってください。質問は推奨案と一緒に、返答の形式の questions に書いてください。elements は空にしてください。",
  },
} as const;

export type AiTemplate = keyof typeof AI_TEMPLATES;

/** 要素の隣り合い。つながりの向きは問わない */
function linked(
  element: ElementSnapshot,
  active: readonly ElementSnapshot[],
): ElementSnapshot[] {
  const byId = new Map(active.map((e) => [e.id as string, e]));
  const out = element.relations
    .map((r) => byId.get(r.to))
    .filter((e): e is ElementSnapshot => e !== undefined);
  const into = active.filter((e) =>
    e.relations.some((r) => r.to === element.id),
  );
  return [...out, ...into];
}

/**
 * 範囲に入る要素を求める（FR-033）。業務なら、業務とその下の業務フロー・活動に、それらに直接つながる要素を加える。
 * 業務フローなら、業務フローと活動に、直接つながる要素を加える。要素なら、その要素と直接つながる要素にする
 */
export function scopeElements(
  elements: readonly ElementSnapshot[],
  scope: AiScope,
): ElementSnapshot[] {
  const active = elements.filter((e) => e.deletedAt === null);
  const root = active.find((e) => e.id === scope.id);
  if (!root) return [];
  const children = (parent: ElementSnapshot, kind: ElementKind) =>
    linked(parent, active).filter(
      (e) => e.kind === kind && parent.relations.some((r) => r.to === e.id),
    );
  let core: ElementSnapshot[] = [root];
  if (scope.type === "business") {
    const flows = children(root, "buc");
    core = [root, ...flows, ...flows.flatMap((f) => children(f, "activity"))];
  } else if (scope.type === "flow") {
    core = [root, ...children(root, "activity")];
  }
  const result = new Map(core.map((e) => [e.id as string, e]));
  for (const element of core) {
    for (const next of linked(element, active)) result.set(next.id, next);
  }
  return [...result.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

/** 要素を、返答の形式と同じ書き方の値にする。確認状態・バージョン・日時は省く */
function elementValue(element: ElementSnapshot) {
  return {
    id: element.id,
    kind: element.kind,
    name: element.name,
    ...(element.summary !== "" && { summary: element.summary }),
    ...(Object.keys(element.attributes).length > 0 && {
      attributes: element.attributes,
    }),
    ...(element.relations.length > 0 && {
      relations: element.relations.map((r) => ({ type: r.typeId, to: r.to })),
    }),
  };
}

const ATTRIBUTE_VALUES: Readonly<Record<string, string>> = {
  mode: "manual（手作業）か system（システム利用）",
  priority: "must・should・could のどれか",
  exceptions: "文字列の一覧",
};

/** 規則の節。範囲にある種類と、それとつなげる種類だけを書く */
function rules(kinds: ReadonlySet<ElementKind>): string {
  const types = RELATION_TYPES.filter(
    (t) => kinds.has(t.from) || kinds.has(t.to),
  );
  const lines = [
    "要素の種類（kind）と表示名:",
    ...[...new Set(types.flatMap((t) => [t.from, t.to]))].map(
      (k) => `- ${k}: ${ELEMENT_KIND_LABELS[k]}`,
    ),
    "",
    "つなげるつながりの種類（type）。つながりは、元の要素の relations に書く:",
    ...types.map(
      (t) =>
        `- ${t.id}: ${ELEMENT_KIND_LABELS[t.from]} から ${ELEMENT_KIND_LABELS[t.to]} へ`,
    ),
    "",
    "活動（activity）の属性（attributes）:",
    ...["mode", "trigger", "input", "procedure", "exceptions", "outcome"].map(
      (key) =>
        `- ${key}: ${ATTRIBUTE_LABELS[key]}${ATTRIBUTE_VALUES[key] ? `（${ATTRIBUTE_VALUES[key]}）` : ""}`,
    ),
    "",
    "要求（requirement）の属性（attributes）:",
    ...["rationale", "origin", "priority", "originalText"].map(
      (key) =>
        `- ${key}: ${ATTRIBUTE_LABELS[key]}${ATTRIBUTE_VALUES[key] ? `（${ATTRIBUTE_VALUES[key]}）` : ""}`,
    ),
  ];
  return lines.join("\n");
}

const RESPONSE_FORMAT = `次の形式の YAML だけを返してください。説明の文は書かないでください。

\`\`\`yaml
format: ${PROPOSAL_FORMAT}
version: 1
elements:
  - id: new-1          # 既存の要素は同じ ID、新しい要素は new- で始まる ID
    kind: activity
    name: 申込内容を確認する
    attributes: { mode: manual }
    relations:
      - { type: activity-actor, to: actor-1 }
questions:
  - { elementId: act-1, body: 例外のときは誰に連絡しますか, recommendation: 研修担当 }
\`\`\`

- 既存の要素を直すときは、つながりも含めて、その要素の全体を書いてください。
- 書かなかった要素は、今のまま残ります。要素を消す提案はできません。`;

/** AI に渡すテキストを作る（FR-033、設計書 5.7 節） */
export function aiPrompt(input: {
  readonly systemName: string;
  readonly elements: readonly ElementSnapshot[];
  readonly questions: readonly QuestionSnapshot[];
  readonly scope: AiScope;
  readonly template: AiTemplate;
}): string {
  const scoped = scopeElements(input.elements, input.scope);
  const ids = new Set(scoped.map((e) => e.id as string));
  const names = new Map(input.elements.map((e) => [e.id as string, e.name]));
  const open = [
    ...input.questions
      .filter((q) => q.state === "open" && ids.has(q.elementId))
      .map(
        (q) =>
          q.body +
          (q.recommendation ? `（推奨案: ${q.recommendation}）` : "") +
          `[${names.get(q.elementId)}]`,
      ),
    ...blankQuestions(scoped, input.questions).map(
      (q) => `${q.body}[${names.get(q.elementId)}]`,
    ),
  ];
  return [
    `# 依頼\n\nシステム「${input.systemName}」の業務設計（RDRA のモデル）について、${AI_TEMPLATES[input.template].request}`,
    `# 規則\n\n${rules(new Set(scoped.map((e) => e.kind)))}`,
    `# 範囲の要素\n\n\`\`\`yaml\n${stringify({ elements: scoped.map(elementValue) }, { lineWidth: 0 })}\`\`\``,
    `# 未解決の問い\n\n${open.length > 0 ? open.map((q) => `- ${q}`).join("\n") : "ありません。"}`,
    `# 返答の形式\n\n${RESPONSE_FORMAT}`,
  ].join("\n\n");
}
