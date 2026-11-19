/** 性質のテストで使う、スキーマに合うモデルの生成器（テスト戦略 3.2 節） */
import {
  AUTHOR_TYPES,
  type DecisionSnapshot,
  ELEMENT_KINDS,
  type ElementKind,
  type ElementSnapshot,
  elementId,
  type LayoutSnapshot,
  QUESTION_AUTHOR_TYPES,
  QUESTION_STATES,
  type QuestionSnapshot,
  RELATION_TYPES,
  REVIEW_STATES,
  relationId,
} from "@sujigaki/domain";
import fc from "fast-check";
import type { ProjectDocument } from "../document.ts";

/** 前後に空白のない、空でない文字列。名前や本文は、作るときに前後の空白を除いてある */
const text = fc
  .string({ unit: "grapheme", minLength: 1, maxLength: 30 })
  .filter((s) => s.trim() === s && s.length > 0);
const optionalText = fc.option(text, { nil: null });
const timestamp = fc
  .date({
    min: new Date("2000-01-01T00:00:00Z"),
    max: new Date("2100-01-01T00:00:00Z"),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString());
const userId = fc.option(fc.constantFrom("u1", "u2"), { nil: null });

/** 種類ごとに、スキーマに合う属性 */
function attributesOf(kind: ElementKind) {
  switch (kind) {
    case "activity":
      return fc.record(
        {
          trigger: text,
          procedure: text,
          exceptions: fc.array(text, { minLength: 1, maxLength: 3 }),
          mode: fc.constantFrom("manual", "system"),
        },
        { requiredKeys: [] },
      );
    case "requirement":
      return fc.record(
        {
          rationale: text,
          priority: fc.constantFrom("must", "should", "could"),
        },
        { requiredKeys: [] },
      );
    case "information":
      return fc.record(
        {
          items: fc.array(
            fc.record(
              { name: text, description: text },
              { requiredKeys: ["name"] },
            ),
            { minLength: 1, maxLength: 3 },
          ),
        },
        { requiredKeys: [] },
      );
    default:
      return fc.constant({});
  }
}

/** id の要素。つながりの先は ids か、ない要素（missing）から選ぶ */
export function elementOf(
  id: string,
  ids: readonly string[],
  kind: fc.Arbitrary<ElementKind> = fc.constantFrom(...ELEMENT_KINDS),
) {
  return kind
    .chain((kind) => {
      const types = RELATION_TYPES.filter((t) => t.from === kind);
      const relation =
        types.length === 0
          ? fc.constant(null)
          : fc.record({
              type: fc.constantFrom(...types),
              to: fc.constantFrom(...ids, "missing"),
            });
      return fc.record({
        kind: fc.constant(kind),
        name: text,
        summary: fc.oneof(fc.constant(""), fc.string({ unit: "grapheme" })),
        attributes: attributesOf(kind),
        reviewState: fc.constantFrom(...REVIEW_STATES),
        authorType: fc.constantFrom(...AUTHOR_TYPES),
        source: optionalText,
        version: fc.integer({ min: 1, max: 100 }),
        relations: fc.uniqueArray(relation, {
          maxLength: 3,
          selector: (r) => (r ? `${r.type.id}\n${r.to}` : ""),
        }),
        links: fc.array(
          fc.record({
            kind: fc.constantFrom("manual", "spec", "design" as const),
            url: fc.webUrl({ validSchemes: ["https"] }),
            label: optionalText,
          }),
          { maxLength: 2 },
        ),
        createdAt: timestamp,
        createdBy: userId,
        updatedAt: timestamp,
        updatedBy: userId,
        deletedAt: fc.option(timestamp, { nil: null }),
        deletedBy: userId,
        reviewedHash: fc.option(fc.stringMatching(/^[0-9a-f]{14}$/), {
          nil: null,
        }),
      });
    })
    .map(
      (e): ElementSnapshot => ({
        ...e,
        id: elementId(id),
        attributes: e.attributes,
        relations: e.relations.flatMap((r, i) =>
          r
            ? [
                {
                  id: relationId(`${id}-r${i}`),
                  typeId: r.type.id,
                  to: elementId(r.to),
                  toKind: r.type.to,
                },
              ]
            : [],
        ),
        links: e.links.map((l, i) => ({ ...l, id: `${id}-l${i}` })),
      }),
    );
}

/** モデル全体。ID は重ならないが、つながりや問いの先にはない要素も含む */
export const documentArbitrary: fc.Arbitrary<ProjectDocument> = fc
  .uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/), { maxLength: 8 })
  .chain((ids) =>
    fc.record({
      project: fc.record({
        name: text,
        systemName: text,
        summaryMaxLength: fc.integer({ min: 1, max: 1000 }),
      }),
      elements: fc.tuple(...ids.map((id) => elementOf(id, ids))),
      questions: fc.uniqueArray(
        fc.record({
          id: fc.stringMatching(/^q[0-9]{1,3}$/),
          elementId: fc.constantFrom(...ids, "missing"),
          body: text,
          recommendation: optionalText,
          state: fc.constantFrom(...QUESTION_STATES),
          answer: optionalText,
          answeredBy: userId,
          answeredAt: fc.option(timestamp, { nil: null }),
          authorType: fc.constantFrom(...QUESTION_AUTHOR_TYPES),
          createdAt: timestamp,
          createdBy: userId,
        }),
        { maxLength: 3, selector: (q) => q.id },
      ) as fc.Arbitrary<QuestionSnapshot[]>,
      decisions: fc.uniqueArray(
        fc.record({
          id: fc.stringMatching(/^d[0-9]{1,3}$/),
          topic: text,
          conclusion: text,
          reason: text,
          questionId: fc.option(fc.constant("q1"), { nil: null }),
          elementIds: fc.array(fc.constantFrom(...ids, "missing"), {
            minLength: 1,
            maxLength: 3,
          }),
          decidedBy: userId,
          decidedAt: timestamp,
        }),
        { maxLength: 3, selector: (d) => d.id },
      ) as unknown as fc.Arbitrary<DecisionSnapshot[]>,
      layouts: fc.uniqueArray(
        fc.record({
          bucId: fc.constantFrom(...ids, "buc"),
          version: fc.integer({ min: 0, max: 100 }),
          updatedAt: fc.option(timestamp, { nil: null }),
          positions: fc.dictionary(
            fc.constantFrom(...ids, "x"),
            fc.record({
              x: fc.double({ noNaN: true, noDefaultInfinity: true }),
              y: fc.integer(),
            }),
          ),
        }),
        { maxLength: 2, selector: (l) => l.bucId },
      ) as fc.Arbitrary<LayoutSnapshot[]>,
    }),
  );
