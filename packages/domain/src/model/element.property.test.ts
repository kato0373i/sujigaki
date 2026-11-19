import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ACTORS, AT, elementSnapshot } from "../testing/index.ts";
import { Element } from "./element.ts";
import { REVIEW_STATES } from "./review-state.ts";

const state = fc.constantFrom(...REVIEW_STATES);
const name = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0);

describe("FR-013 内容の編集と確認状態の性質", () => {
  it("名前を変えると、どの確認状態からも未レビューに戻り、バージョンが1つ上がる", () => {
    fc.assert(
      fc.property(state, name, (reviewState, newName) => {
        const element = Element.fromSnapshot(
          elementSnapshot("e1", "activity", { name: "元の名前", reviewState }),
        );
        fc.pre(newName.trim() !== "元の名前");
        const result = element.edit({ name: newName }, ACTORS.editor, AT);
        if (!result.ok) throw new Error(result.error.message);
        const next = result.value.element;
        expect(next.reviewState).toBe("unreviewed");
        expect(next.version).toBe(element.version + 1);
      }),
    );
  });

  it("今と同じ名前で編集しても、バージョンも確認状態も変わらない", () => {
    fc.assert(
      fc.property(state, name, (reviewState, current) => {
        const element = Element.fromSnapshot(
          elementSnapshot("e1", "activity", {
            name: current.trim(),
            reviewState,
          }),
        );
        const result = element.edit({ name: current }, ACTORS.editor, AT);
        if (!result.ok) throw new Error(result.error.message);
        expect(result.value.element.toSnapshot()).toEqual(element.toSnapshot());
        expect(result.value.events).toEqual([]);
      }),
    );
  });
});
