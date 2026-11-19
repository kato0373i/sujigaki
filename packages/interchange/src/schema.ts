import {
  ATTRIBUTE_SCHEMAS,
  AUTHOR_TYPES,
  ELEMENT_KINDS,
  EXTERNAL_LINK_KINDS,
  QUESTION_AUTHOR_TYPES,
  QUESTION_STATES,
  REVIEW_STATES,
} from "@sujigaki/domain";
import { z } from "zod";
import { FORMAT_VERSION } from "./document.ts";

/**
 * YAML の形式（FR-050）。公開する JSON Schema もここから作る。
 * 既定の値と同じ項目は書き出さないため、多くの項目を省略できる。
 */

/** ID はローカルモードのファイル名にも使うため、英数字と「-」「_」に限る（設計書 5.4 節） */
const id = z.string().regex(/^[A-Za-z0-9_-]+$/, {
  error: "ID に使えるのは、英数字と「-」「_」だけです。",
});
const text = z.string().trim().min(1);
const userId = z.string().min(1);
const timestamp = z.iso.datetime().meta({ id: "timestamp" });

const linkSchema = z
  .strictObject({
    id,
    kind: z.enum(EXTERNAL_LINK_KINDS),
    url: z.url({ protocol: /^https?$/ }),
    label: text.optional(),
  })
  .meta({ id: "link", description: "外部リンク（FR-004）" });

const relationSchema = z
  .strictObject({
    id,
    /** つながりの種類。元と先の種類を `-` でつないだもの（例: `activity-usecase`） */
    type: z.string().min(1),
    to: id,
  })
  .meta({ id: "relation", description: "つながり。元の要素の下に書く" });

function elementSchemaOf(kind: (typeof ELEMENT_KINDS)[number]) {
  return z.strictObject({
    id,
    kind: z.literal(kind),
    name: z.string().trim().min(1).max(200),
    summary: z.string().optional(),
    attributes: ATTRIBUTE_SCHEMAS[kind].optional(),
    reviewState: z.enum(REVIEW_STATES).optional(),
    authorType: z.enum(AUTHOR_TYPES).optional(),
    source: text.optional(),
    links: z.array(linkSchema).optional(),
    relations: z.array(relationSchema).optional(),
    version: z.number().int().min(1).optional(),
    createdAt: timestamp,
    createdBy: userId.optional(),
    updatedAt: timestamp,
    updatedBy: userId.optional(),
    deletedAt: timestamp.optional(),
    deletedBy: userId.optional(),
  });
}

const elementSchema = z.discriminatedUnion(
  "kind",
  ELEMENT_KINDS.map(elementSchemaOf) as unknown as [
    ReturnType<typeof elementSchemaOf>,
    ...ReturnType<typeof elementSchemaOf>[],
  ],
  { error: "要素の種類が正しくありません。" },
);

const questionSchema = z.strictObject({
  id,
  elementId: id,
  body: text,
  recommendation: text.optional(),
  state: z.enum(QUESTION_STATES).optional(),
  answer: text.optional(),
  answeredBy: userId.optional(),
  answeredAt: timestamp.optional(),
  authorType: z.enum(QUESTION_AUTHOR_TYPES),
  createdAt: timestamp,
  createdBy: userId.optional(),
});

const decisionSchema = z.strictObject({
  id,
  topic: text,
  conclusion: text,
  reason: text,
  questionId: id.optional(),
  elementIds: z.array(id).min(1),
  decidedBy: userId.optional(),
  decidedAt: timestamp,
});

const positionSchema = z.strictObject({
  x: z.number().refine(Number.isFinite),
  y: z.number().refine(Number.isFinite),
});

const layoutSchema = z.strictObject({
  bucId: id,
  version: z.number().int().min(0),
  updatedAt: timestamp.optional(),
  positions: z.record(z.string(), positionSchema),
});

export const documentSchema = z.strictObject({
  format: z.literal("sujigaki", {
    error: "sujigaki の YAML ファイルではありません。",
  }),
  version: z.literal(FORMAT_VERSION),
  project: z.strictObject({
    name: text,
    systemName: text,
    summaryMaxLength: z.number().int().min(1).optional(),
  }),
  elements: z.array(elementSchema).optional(),
  questions: z.array(questionSchema).optional(),
  decisions: z.array(decisionSchema).optional(),
  layouts: z.array(layoutSchema).optional(),
});

export type DocumentYaml = z.input<typeof documentSchema>;
export type ElementYaml = z.input<typeof elementSchema>;

/** 公開する JSON Schema（FR-050）。YAML のエディターで補完と検査に使える */
export function projectJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(documentSchema, { io: "input" }),
    title: "sujigaki のプロジェクト",
  };
}
