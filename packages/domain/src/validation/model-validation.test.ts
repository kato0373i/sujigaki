import { describe, expect, it } from "vitest";
import {
  type ElementSnapshot,
  elementId,
  type Relation,
  relationId,
} from "../model/element.ts";
import type { ElementKind } from "../model/element-kind.ts";
import { validateModel } from "./model-validation.ts";

const at = "2026-11-19T00:00:00.000Z";

function element(
  id: string,
  kind: ElementKind,
  overrides: Partial<ElementSnapshot> = {},
): ElementSnapshot {
  return {
    id: elementId(id),
    kind,
    name: id,
    summary: "",
    attributes: {},
    reviewState: "unreviewed",
    authorType: "human",
    source: null,
    version: 1,
    deletedAt: null,
    deletedBy: null,
    links: [],
    relations: [],
    createdAt: at,
    createdBy: null,
    updatedAt: at,
    updatedBy: null,
    ...overrides,
  };
}

function relation(to: ElementSnapshot): Relation {
  return {
    id: relationId(`r-${to.id}`),
    typeId: "",
    to: to.id,
    toKind: to.kind,
  };
}

const options = { summaryMaxLength: 10 };

describe("モデルの検証：切れたつながりと要約の長さ", () => {
  it("先の要素がないつながりと、先が削除済みのつながりを見つける", () => {
    const removed = element("removed", "information", { deletedAt: at });
    const missing = element("missing", "screen");
    const usecase = element("uc", "usecase", {
      relations: [relation(removed), relation(missing)],
    });
    const violations = validateModel([usecase, removed], options).filter(
      (v) => v.rule === "brokenRelation",
    );
    expect(violations.map((v) => v.relationId)).toEqual([
      "r-removed",
      "r-missing",
    ]);
  });

  it("削除済みの要素は検証しない", () => {
    const removed = element("removed", "usecase", {
      deletedAt: at,
      summary: "とても長い要約を書いてしまった",
      relations: [relation(element("missing", "screen"))],
    });
    expect(validateModel([removed], options)).toEqual([]);
  });

  it("要約が上限を超える要素を見つけ、上限ちょうどは違反にしない", () => {
    const long = element("long", "requirement", { summary: "あ".repeat(11) });
    const exact = element("exact", "requirement", { summary: "あ".repeat(10) });
    const violations = validateModel([long, exact], options).filter(
      (v) => v.rule === "summaryTooLong",
    );
    expect(violations).toEqual([
      {
        rule: "summaryTooLong",
        elementId: "long",
        message:
          "要約が11字あります。上限は10字です。長い説明は外部リンクに移してください。",
      },
    ]);
  });
});
