import {
  ATTRIBUTE_SCHEMAS,
  ELEMENT_KIND_LABELS,
  ELEMENT_KINDS,
  type ElementId,
  type ElementSnapshot,
  RELATION_TYPES,
  type Relation,
} from "@sujigaki/domain";
import { z } from "zod";
import { type Path, parseYaml, type ReadIssue } from "./yaml-codec.ts";

export const PROPOSAL_FORMAT = "sujigaki-proposal";

const id = z.string().regex(/^[A-Za-z0-9_-]+$/, {
  error: "ID に使えるのは、英数字と「-」「_」だけです。",
});
const text = z.string().trim().min(1);

function proposalElementOf(kind: (typeof ELEMENT_KINDS)[number]) {
  // AI の返答には余分な項目が付きやすいため、知らない項目は無視する。属性は種類ごとの定義どおりに確かめる
  return z.object({
    id,
    kind: z.literal(kind),
    name: z.string().trim().min(1).max(200),
    summary: z.string().optional(),
    attributes: ATTRIBUTE_SCHEMAS[kind].optional(),
    relations: z
      .array(z.object({ id: id.optional(), type: z.string().min(1), to: id }))
      .optional(),
  });
}

const proposalSchema = z.object({
  format: z.literal(PROPOSAL_FORMAT, {
    error: "sujigaki の提案の形式ではありません。",
  }),
  version: z.literal(1),
  elements: z
    .array(
      z.discriminatedUnion(
        "kind",
        ELEMENT_KINDS.map(proposalElementOf) as unknown as [
          ReturnType<typeof proposalElementOf>,
          ...ReturnType<typeof proposalElementOf>[],
        ],
        { error: "要素の種類が正しくありません。" },
      ),
    )
    .optional(),
  questions: z
    .array(
      z.object({
        elementId: id,
        body: text,
        recommendation: text.optional(),
      }),
    )
    .optional(),
});

/** AI が提案した問い（FR-031）。取り込むときに、作成者の種類を AI にして保存する */
export interface ProposedQuestion {
  readonly elementId: ElementId;
  readonly body: string;
  readonly recommendation: string | null;
}

export type ProposalResult =
  | {
      readonly ok: true;
      readonly elements: readonly ElementSnapshot[];
      readonly questions: readonly ProposedQuestion[];
    }
  | { readonly ok: false; readonly issues: readonly ReadIssue[] };

/** 返答がコードブロックで囲まれていれば、中身だけを取り出す */
function unwrapCodeBlock(reply: string): string {
  const match = /```(?:ya?ml)?[^\n]*\n([\s\S]*?)```/.exec(reply);
  return match?.[1] ?? reply;
}

/**
 * AI の返答を読む（設計書 5.7 節、FR-034）。要素は確認状態を未レビュー、作成者の種類を AI にする。
 * 今のモデルにある要素は、外部リンクと作成の情報を今のまま保つ。返答の形式に外部リンクがないためである
 */
export function readProposal(
  reply: string,
  current: readonly ElementSnapshot[],
  at: Date,
): ProposalResult {
  const parsed = parseYaml(unwrapCodeBlock(reply));
  if (!parsed.ok) return parsed;
  const result = proposalSchema.safeParse(parsed.value, {
    error: z.locales.ja().localeError,
  });
  const issue = (path: Path, message: string): ReadIssue => ({
    path,
    line: parsed.locate(path),
    message,
  });
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((i) =>
        issue(
          i.path.filter((p): p is string | number => typeof p !== "symbol"),
          i.message,
        ),
      ),
    };
  }

  const issues: ReadIssue[] = [];
  const seen = new Set<string>();
  const elements = result.data.elements ?? [];
  elements.forEach((element, i) => {
    if (seen.has(element.id)) {
      issues.push(
        issue(
          ["elements", i, "id"],
          `要素の ID「${element.id}」が重なっています。`,
        ),
      );
    }
    seen.add(element.id);
    (element.relations ?? []).forEach((r, j) => {
      const type = RELATION_TYPES.find((t) => t.id === r.type);
      if (!type || type.from !== element.kind) {
        issues.push(
          issue(
            ["elements", i, "relations", j, "type"],
            `「${ELEMENT_KIND_LABELS[element.kind]}」の要素は、つながりの種類「${r.type}」を持てません。`,
          ),
        );
      }
    });
  });
  if (issues.length > 0) return { ok: false, issues };

  const now = at.toISOString();
  const existing = new Map(current.map((e) => [e.id as string, e]));
  return {
    ok: true,
    elements: elements.map((e): ElementSnapshot => {
      const before = existing.get(e.id);
      return {
        id: e.id as ElementId,
        kind: e.kind,
        name: e.name,
        summary: e.summary ?? before?.summary ?? "",
        attributes: (e.attributes ?? {}) as ElementSnapshot["attributes"],
        reviewState: "unreviewed",
        reviewedHash: null,
        authorType: before?.authorType ?? "ai",
        source: before?.source ?? null,
        version: before?.version ?? 1,
        deletedAt: null,
        deletedBy: null,
        links: before?.links ?? [],
        relations: (e.relations ?? []).map(
          (r): Relation => ({
            id: (r.id ?? `${e.id}-${r.type}-${r.to}`) as Relation["id"],
            typeId: r.type,
            to: r.to as ElementId,
            toKind: (
              RELATION_TYPES.find((t) => t.id === r.type) ?? { to: e.kind }
            ).to,
          }),
        ),
        createdAt: before?.createdAt ?? now,
        createdBy: before?.createdBy ?? null,
        updatedAt: now,
        updatedBy: null,
      };
    }),
    questions: (result.data.questions ?? []).map((q) => ({
      elementId: q.elementId as ElementId,
      body: q.body,
      recommendation: q.recommendation ?? null,
    })),
  };
}
