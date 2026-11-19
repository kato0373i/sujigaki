import {
  DEFAULT_SUMMARY_MAX_LENGTH,
  type DecisionSnapshot,
  ELEMENT_KIND_LABELS,
  type ElementId,
  type ElementSnapshot,
  type ExternalLink,
  type LayoutSnapshot,
  type QuestionSnapshot,
  RELATION_TYPES,
  type Relation,
} from "@sujigaki/domain";
import { LineCounter, parseDocument, stringify } from "yaml";
import { z } from "zod";
import {
  FORMAT_VERSION,
  normalizeDocument,
  type ProjectDocument,
} from "./document.ts";
import { documentSchema } from "./schema.ts";

/** 読み込めなかった箇所。path は YAML の中の位置、line は1から数えた行番号 */
export interface ReadIssue {
  readonly path: readonly (string | number)[];
  readonly line: number | null;
  readonly message: string;
}

export type ReadResult =
  | { readonly ok: true; readonly document: ProjectDocument }
  | { readonly ok: false; readonly issues: readonly ReadIssue[] };

type Parsed = z.output<typeof documentSchema>;
type Path = (string | number)[];

/** モデル全体を YAML に書き出す。既定の値と同じ項目は省く */
export function writeProjectYaml(document: ProjectDocument): string {
  const doc = normalizeDocument(document);
  const value = {
    format: "sujigaki",
    version: FORMAT_VERSION,
    project: {
      name: doc.project.name,
      systemName: doc.project.systemName,
      ...(doc.project.summaryMaxLength !== DEFAULT_SUMMARY_MAX_LENGTH && {
        summaryMaxLength: doc.project.summaryMaxLength,
      }),
    },
    elements: doc.elements.map(elementToYaml),
    questions: doc.questions.map(questionToYaml),
    decisions: doc.decisions.map(decisionToYaml),
    layouts: doc.layouts.map((l) => ({
      bucId: l.bucId,
      version: l.version,
      ...optional("updatedAt", l.updatedAt),
      positions: l.positions,
    })),
  };
  return stringify(value, { lineWidth: 0 });
}

/**
 * YAML を読み込む。形式に合わなければ、モデルは作らずに合わない箇所をすべて返す（FR-050）。
 * つながりの先の要素がないことは、読み込みでは拒否せず、検証（FR-040）で知らせる。
 */
export function readProjectYaml(text: string): ReadResult {
  const lineCounter = new LineCounter();
  const yaml = parseDocument(text, { lineCounter });
  const lineOf = (offset: number) => lineCounter.linePos(offset).line;
  if (yaml.errors.length > 0) {
    return {
      ok: false,
      issues: yaml.errors.map((error) => ({
        path: [],
        line: lineOf(error.pos[0]),
        message: `YAML として読めません（${error.code}）。`,
      })),
    };
  }
  const locate = (path: Path): number | null => {
    for (let depth = path.length; depth >= 0; depth--) {
      const node = yaml.getIn(path.slice(0, depth), true) as
        | { range?: [number, number, number] }
        | undefined;
      if (node?.range) return lineOf(node.range[0]);
    }
    return null;
  };

  const raw: unknown = yaml.toJS();
  const version = versionIssue(raw);
  if (version)
    return { ok: false, issues: [{ ...version, line: locate(version.path) }] };

  const parsed = documentSchema.safeParse(raw, {
    error: z.locales.ja().localeError,
  });
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.filter(
          (p): p is string | number => typeof p !== "symbol",
        );
        return { path, line: locate(path), message: issue.message };
      }),
    };
  }
  const problems = consistencyIssues(parsed.data);
  if (problems.length > 0) {
    return {
      ok: false,
      issues: problems.map((p) => ({ ...p, line: locate(p.path) })),
    };
  }
  return { ok: true, document: normalizeDocument(fromParsed(parsed.data)) };
}

function versionIssue(raw: unknown): { path: Path; message: string } | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { path: [], message: "sujigaki の YAML ファイルではありません。" };
  }
  const version = (raw as { version?: unknown }).version;
  if (typeof version === "number" && version > FORMAT_VERSION) {
    return {
      path: ["version"],
      message: `このファイルは新しいバージョン（${version}）の形式です。sujigaki を更新してから読み込んでください。`,
    };
  }
  return null;
}

/** スキーマだけでは確かめられない、ID の重なりとつながりの種類を確かめる */
function consistencyIssues(data: Parsed): { path: Path; message: string }[] {
  const issues: { path: Path; message: string }[] = [];
  const duplicates = <T>(
    items: readonly T[] | undefined,
    key: (item: T) => string,
    path: (index: number) => Path,
    message: (value: string) => string,
  ) => {
    const seen = new Set<string>();
    (items ?? []).forEach((item, index) => {
      const value = key(item);
      if (seen.has(value))
        issues.push({ path: path(index), message: message(value) });
      seen.add(value);
    });
  };

  duplicates(
    data.elements,
    (e) => e.id,
    (i) => ["elements", i, "id"],
    (v) => `要素の ID「${v}」が重なっています。`,
  );
  (data.elements ?? []).forEach((element, i) => {
    const relations = element.relations ?? [];
    relations.forEach((relation, j) => {
      const type = RELATION_TYPES.find((t) => t.id === relation.type);
      const path: Path = ["elements", i, "relations", j, "type"];
      if (!type) {
        issues.push({
          path,
          message: `つながりの種類「${relation.type}」はありません。`,
        });
      } else if (type.from !== element.kind) {
        issues.push({
          path,
          message: `「${ELEMENT_KIND_LABELS[element.kind]}」の要素は、つながりの種類「${relation.type}」を持てません。`,
        });
      }
    });
    duplicates(
      relations,
      (r) => r.id,
      (j) => ["elements", i, "relations", j, "id"],
      (v) => `つながりの ID「${v}」が重なっています。`,
    );
    duplicates(
      relations,
      (r) => `${r.type}\n${r.to}`,
      (j) => ["elements", i, "relations", j],
      () => "同じ種類で同じ先へのつながりが重なっています。",
    );
  });
  duplicates(
    data.questions,
    (q) => q.id,
    (i) => ["questions", i, "id"],
    (v) => `問いの ID「${v}」が重なっています。`,
  );
  duplicates(
    data.decisions,
    (d) => d.id,
    (i) => ["decisions", i, "id"],
    (v) => `決定記録の ID「${v}」が重なっています。`,
  );
  duplicates(
    data.layouts,
    (l) => l.bucId,
    (i) => ["layouts", i, "bucId"],
    (v) => `業務フロー「${v}」の図の配置が重なっています。`,
  );
  return issues;
}

function optional<K extends string, V>(
  key: K,
  value: V | null | undefined,
): { [P in K]?: V } {
  return value === null || value === undefined
    ? {}
    : ({ [key]: value } as { [P in K]: V });
}

function elementToYaml(e: ElementSnapshot) {
  return {
    id: e.id,
    kind: e.kind,
    name: e.name,
    ...(e.summary !== "" && { summary: e.summary }),
    ...(Object.keys(e.attributes).length > 0 && { attributes: e.attributes }),
    reviewState: e.reviewState,
    authorType: e.authorType,
    ...optional("source", e.source),
    ...(e.links.length > 0 && {
      links: e.links.map((l) => ({
        id: l.id,
        kind: l.kind,
        url: l.url,
        ...optional("label", l.label),
      })),
    }),
    ...(e.relations.length > 0 && {
      relations: e.relations.map((r) => ({
        id: r.id,
        type: r.typeId,
        to: r.to,
      })),
    }),
    version: e.version,
    createdAt: e.createdAt,
    ...optional("createdBy", e.createdBy),
    updatedAt: e.updatedAt,
    ...optional("updatedBy", e.updatedBy),
    ...optional("deletedAt", e.deletedAt),
    ...optional("deletedBy", e.deletedBy),
  };
}

function questionToYaml(q: QuestionSnapshot) {
  return {
    id: q.id,
    elementId: q.elementId,
    body: q.body,
    ...optional("recommendation", q.recommendation),
    state: q.state,
    ...optional("answer", q.answer),
    ...optional("answeredBy", q.answeredBy),
    ...optional("answeredAt", q.answeredAt),
    authorType: q.authorType,
    createdAt: q.createdAt,
    ...optional("createdBy", q.createdBy),
  };
}

function decisionToYaml(d: DecisionSnapshot) {
  return {
    id: d.id,
    topic: d.topic,
    conclusion: d.conclusion,
    reason: d.reason,
    ...optional("questionId", d.questionId),
    elementIds: d.elementIds,
    ...optional("decidedBy", d.decidedBy),
    decidedAt: d.decidedAt,
  };
}

function fromParsed(data: Parsed): ProjectDocument {
  return {
    project: {
      name: data.project.name,
      systemName: data.project.systemName,
      summaryMaxLength:
        data.project.summaryMaxLength ?? DEFAULT_SUMMARY_MAX_LENGTH,
    },
    elements: (data.elements ?? []).map(
      (e): ElementSnapshot => ({
        id: e.id as ElementId,
        kind: e.kind,
        name: e.name,
        summary: e.summary ?? "",
        attributes: (e.attributes ?? {}) as ElementSnapshot["attributes"],
        reviewState: e.reviewState ?? "unreviewed",
        authorType: e.authorType ?? "human",
        source: e.source ?? null,
        version: e.version ?? 1,
        deletedAt: e.deletedAt ?? null,
        deletedBy: e.deletedBy ?? null,
        links: (e.links ?? []).map(
          (l): ExternalLink => ({ ...l, label: l.label ?? null }),
        ),
        relations: (e.relations ?? []).map(
          (r): Relation => ({
            id: r.id as Relation["id"],
            typeId: r.type,
            to: r.to as ElementId,
            // つながりの種類は consistencyIssues で確かめてある
            toKind: (
              RELATION_TYPES.find((t) => t.id === r.type) ?? { to: e.kind }
            ).to,
          }),
        ),
        createdAt: e.createdAt,
        createdBy: e.createdBy ?? null,
        updatedAt: e.updatedAt,
        updatedBy: e.updatedBy ?? null,
      }),
    ),
    questions: (data.questions ?? []).map(
      (q): QuestionSnapshot => ({
        id: q.id as QuestionSnapshot["id"],
        elementId: q.elementId as ElementId,
        body: q.body,
        recommendation: q.recommendation ?? null,
        state: q.state ?? "open",
        answer: q.answer ?? null,
        answeredBy: q.answeredBy ?? null,
        answeredAt: q.answeredAt ?? null,
        authorType: q.authorType,
        createdAt: q.createdAt,
        createdBy: q.createdBy ?? null,
      }),
    ),
    decisions: (data.decisions ?? []).map(
      (d): DecisionSnapshot => ({
        id: d.id as DecisionSnapshot["id"],
        topic: d.topic,
        conclusion: d.conclusion,
        reason: d.reason,
        questionId: (d.questionId ?? null) as DecisionSnapshot["questionId"],
        elementIds: d.elementIds as ElementId[],
        decidedBy: d.decidedBy ?? null,
        decidedAt: d.decidedAt,
      }),
    ),
    layouts: (data.layouts ?? []).map(
      (l): LayoutSnapshot => ({
        bucId: l.bucId as ElementId,
        version: l.version,
        updatedAt: l.updatedAt ?? null,
        positions: l.positions as LayoutSnapshot["positions"],
      }),
    ),
  };
}
