import { decisionId, questionId } from "@sujigaki/domain";
import {
  AT,
  elementSnapshot,
  questionSnapshot,
  relationTo,
} from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { businessScope } from "./business-scope.ts";
import type { ProjectDocument } from "./document.ts";
import { diffElements } from "./import-diff.ts";

const reception = elementSnapshot("u1", "actor", { name: "受付担当" });
const confirm = elementSnapshot("a1", "activity", {
  name: "申込を確認する",
  relations: [relationTo(reception, "activity")],
});
const flow = elementSnapshot("f1", "buc", {
  name: "申込受付",
  relations: [relationTo(confirm, "buc")],
});
const business = elementSnapshot("b1", "business", {
  name: "申込",
  relations: [relationTo(flow, "business")],
});
const otherFlow = elementSnapshot("f2", "buc", { name: "請求の流れ" });
const other = elementSnapshot("b2", "business", {
  name: "請求",
  relations: [relationTo(otherFlow, "business")],
});
const layout = (bucId: string) => ({
  bucId: bucId as never,
  version: 1,
  updatedAt: null,
  positions: {},
});
const document: ProjectDocument = {
  project: {
    name: "申込管理",
    systemName: "申込システム",
    summaryMaxLength: 100,
  },
  elements: [business, flow, confirm, reception, other, otherFlow],
  questions: [
    questionSnapshot("a1", { id: questionId("q1") }),
    questionSnapshot("f2", { id: questionId("q2") }),
  ],
  decisions: [
    {
      id: decisionId("d1"),
      topic: "担当",
      conclusion: "受付担当",
      reason: "",
      questionId: null,
      elementIds: [confirm.id, otherFlow.id],
      decidedBy: null,
      decidedAt: AT.toISOString(),
    },
    {
      id: decisionId("d2"),
      topic: "請求",
      conclusion: "月末",
      reason: "",
      questionId: null,
      elementIds: [otherFlow.id],
      decidedBy: null,
      decidedAt: AT.toISOString(),
    },
  ],
  layouts: [layout("f1"), layout("f2")],
};

describe("FR-050 業務の範囲", () => {
  it("業務・業務フロー・活動と直接つながる要素、その問い・決定記録・図の配置を切り出す", () => {
    const scoped = businessScope(document, "b1");
    expect(scoped.elements.map((e) => e.id)).toEqual(["b1", "f1", "a1", "u1"]);
    expect(scoped.questions.map((q) => q.id)).toEqual(["q1"]);
    expect(scoped.decisions.map((d) => d.id)).toEqual(["d1"]);
    expect(scoped.layouts.map((l) => l.bucId)).toEqual(["f1"]);
  });

  it("範囲のファイルを取り込むときは、範囲の要素だけを削除の変更にする", () => {
    const file = businessScope(document, "b1").elements.filter(
      (e) => e.id !== "u1",
    );
    const changes = diffElements(document.elements, file, {
      removeMissing: true,
      removeOnly: new Set(
        businessScope(document, "b1").elements.map((e) => e.id),
      ),
    }).changes;
    expect(
      changes.map((c) => [
        c.type,
        c.type === "add" ? c.element.id : c.elementId,
      ]),
    ).toEqual([["remove", "u1"]]);
  });
});
