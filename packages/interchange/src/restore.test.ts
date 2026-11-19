import {
  ACTORS,
  elementSnapshot,
  LOCAL_ACTOR,
  questionSnapshot,
} from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import type { ProjectDocument } from "./document.ts";
import { restoreDocument } from "./restore.ts";

const document: ProjectDocument = {
  project: {
    name: "申込管理",
    systemName: "申込システム",
    summaryMaxLength: 100,
  },
  elements: [
    elementSnapshot("a1", "activity", { reviewState: "approved" }),
    elementSnapshot("a2", "activity", { reviewState: "needs_fix" }),
  ],
  questions: [questionSnapshot("a1")],
  decisions: [],
  layouts: [],
};

const states = (d: ProjectDocument) => d.elements.map((e) => e.reviewState);

describe("FR-050 空のプロジェクトに復元する", () => {
  it("業務責任者が復元すると、確認状態を含めて同じ内容になる", () => {
    expect(restoreDocument(document, ACTORS.owner)).toEqual(document);
  });

  it("編集者が復元すると、確認状態だけがすべて未レビューになる", () => {
    const restored = restoreDocument(document, ACTORS.editor);
    expect(states(restored)).toEqual(["unreviewed", "unreviewed"]);
    expect({ ...restored, elements: [] }).toEqual({
      ...document,
      elements: [],
    });
    expect(restored.elements.map((e) => e.name)).toEqual(["a1", "a2"]);
  });

  it("ローカルモードでは、確認状態を保つ", () => {
    expect(states(restoreDocument(document, LOCAL_ACTOR))).toEqual([
      "approved",
      "needs_fix",
    ]);
  });
});
