import { describe, expect, it } from "vitest";
import {
  type ElementSnapshot,
  elementId,
  relationId,
} from "../model/element.ts";
import type { ElementKind } from "../model/element-kind.ts";
import { blankQuestions } from "./blank-questions.ts";
import { type QuestionSnapshot, questionId } from "./question.ts";

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

function saved(id: string, body: string): QuestionSnapshot {
  return {
    id: questionId(`q-${id}`),
    elementId: elementId(id),
    body,
    recommendation: null,
    state: "withdrawn",
    answer: null,
    answeredBy: null,
    answeredAt: null,
    authorType: "auto",
    createdAt: at,
    createdBy: null,
  };
}

const filled = {
  mode: "manual",
  trigger: "申込書が届く",
  outcome: "審査待ちになる",
};

describe("空欄から作る問い", () => {
  it("担当者が空の活動に「担当者は誰ですか」と問う", () => {
    const activity = element("act", "activity", { attributes: filled });
    expect(blankQuestions([activity], [])).toEqual([
      {
        key: "act:actor",
        elementId: "act",
        blank: "actor",
        body: "担当者は誰ですか",
      },
    ]);
  });

  it("担当者が削除済みなら、空欄として問う", () => {
    const actor = element("actor", "actor", { deletedAt: at });
    const activity = element("act", "activity", {
      attributes: filled,
      relations: [
        {
          id: relationId("r1"),
          typeId: "activity-actor",
          to: actor.id,
          toKind: "actor",
        },
      ],
    });
    expect(blankQuestions([activity, actor], []).map((q) => q.blank)).toEqual([
      "actor",
    ]);
  });

  it("空欄ごとに問いを作り、埋まった項目には問わない", () => {
    const activity = element("act", "activity", {
      attributes: { mode: "system" },
    });
    const requirement = element("req", "requirement");
    expect(
      blankQuestions([activity, requirement], []).map((q) => q.key),
    ).toEqual(["act:actor", "act:trigger", "act:outcome", "req:rationale"]);
  });

  it("同じ要素に同じ問いが保存されていれば、重ねて出さない", () => {
    const activity = element("act", "activity", { attributes: filled });
    expect(
      blankQuestions([activity], [saved("act", "担当者は誰ですか")]),
    ).toEqual([]);
  });

  it("削除済みの要素には問わない", () => {
    const activity = element("act", "activity", { deletedAt: at });
    expect(blankQuestions([activity], [])).toEqual([]);
  });
});
