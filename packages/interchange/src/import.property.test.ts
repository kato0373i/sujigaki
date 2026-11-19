import { ELEMENT_KINDS, type ElementSnapshot } from "@sujigaki/domain";
import { ACTORS, AT } from "@sujigaki/domain/testing";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyImport } from "./import-apply.ts";
import { changedFields, diffElements } from "./import-diff.ts";
import { elementOf } from "./testing/arbitraries.ts";

/**
 * 同じ ID の要素を、今のモデルと取り込む側で別々の内容にして作る。種類は両方で同じにする。
 * どちらか一方にしかない要素もある。
 */
const pair = fc
  .uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/), {
    minLength: 1,
    maxLength: 6,
  })
  .chain((ids) =>
    fc.tuple(
      ...ids.map((id) =>
        fc.constantFrom(...ELEMENT_KINDS).chain((kind) =>
          fc.record({
            before: fc.option(elementOf(id, ids, fc.constant(kind)), {
              nil: null,
            }),
            after: fc.option(elementOf(id, ids, fc.constant(kind)), {
              nil: null,
            }),
          }),
        ),
      ),
    ),
  )
  .map((pairs) => ({
    current: pairs.flatMap((p) => (p.before ? [p.before] : [])),
    incoming: pairs.flatMap((p) => (p.after ? [p.after] : [])),
  }));

const active = (elements: readonly ElementSnapshot[]) =>
  elements.filter((e) => e.deletedAt === null);

describe("FR-034 FR-050 取り込みの差分の性質", () => {
  it("すべての差分を当てると、有効な要素の内容が取り込む側と同じになる", () => {
    fc.assert(
      fc.property(pair, ({ current, incoming }) => {
        const { changes } = diffElements(current, incoming, {
          removeMissing: true,
        });
        const result = applyImport(current, changes, ACTORS.editor, AT, {
          authorType: "import",
          source: "テスト",
        });
        if (!result.ok) throw new Error(result.error.message);
        const applied = active(result.value.elements);
        expect(applied.map((e) => e.id).sort()).toEqual(
          active(incoming)
            .map((e) => e.id)
            .sort(),
        );
        for (const after of active(incoming)) {
          const element = applied.find((e) => e.id === after.id);
          if (!element) throw new Error(`${after.id} がない`);
          expect(changedFields(element, after)).toEqual([]);
        }
      }),
    );
  });

  it("差分を当てたあとにもう一度差分を出すと、変更はない", () => {
    fc.assert(
      fc.property(pair, ({ current, incoming }) => {
        const { changes } = diffElements(current, incoming, {
          removeMissing: true,
        });
        const result = applyImport(current, changes, ACTORS.editor, AT, {
          authorType: "import",
          source: "テスト",
        });
        if (!result.ok) throw new Error(result.error.message);
        const again = diffElements(result.value.elements, incoming, {
          removeMissing: true,
        });
        expect(again.changes).toEqual([]);
      }),
    );
  });

  it("内容が変わらない要素は、つながる先が削除されない限り確認状態を保つ", () => {
    fc.assert(
      fc.property(pair, ({ current, incoming }) => {
        const { changes } = diffElements(current, incoming, {
          removeMissing: true,
        });
        const result = applyImport(current, changes, ACTORS.editor, AT, {
          authorType: "import",
          source: "テスト",
        });
        if (!result.ok) throw new Error(result.error.message);
        const touched = new Set(
          changes.map((c) => (c.type === "add" ? c.element.id : c.elementId)),
        );
        const removed = new Set(
          changes.flatMap((c) => (c.type === "remove" ? [c.elementId] : [])),
        );
        for (const before of current) {
          if (touched.has(before.id)) continue;
          if (before.relations.some((r) => removed.has(r.to))) continue;
          const element = result.value.elements.find((e) => e.id === before.id);
          expect(element?.reviewState).toBe(before.reviewState);
        }
      }),
    );
  });
});
