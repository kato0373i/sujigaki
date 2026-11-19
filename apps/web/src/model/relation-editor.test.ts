import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { relationCandidates, relationRows } from "./relation-editor.ts";

const reception = elementSnapshot("u1", "actor", { name: "受付担当" });
const reviewer = elementSnapshot("u2", "actor", { name: "審査担当" });
const screen = elementSnapshot("s1", "screen", { name: "申込画面" });
const requirement = elementSnapshot("r1", "requirement", {
  name: "早く審査したい",
});
const activity = elementSnapshot("a1", "activity", {
  name: "申込を確認する",
  relations: [relationTo(reception, "activity")],
});
const flow = elementSnapshot("f1", "buc", {
  name: "申込受付",
  relations: [relationTo(activity, "buc")],
});
const removed = elementSnapshot("u9", "actor", {
  name: "削除した担当",
  deletedAt: "2026-11-20T00:00:00.000Z",
});
const elements = [
  reception,
  reviewer,
  screen,
  requirement,
  activity,
  flow,
  removed,
];

describe("P-01 つながりの編集", () => {
  it("自分が持つつながりと、ほかの要素から自分へのつながりを、種類ごとに並べる", () => {
    expect(
      relationRows(activity, elements).map((r) => [
        r.kindLabel,
        r.other?.name,
        r.owner.id,
      ]),
    ).toEqual([
      ["業務フロー", "申込受付", "f1"],
      ["登場人物", "受付担当", "a1"],
    ]);
  });

  it("FR-001 つなげる種類の要素だけを候補にし、すでにつながっている要素と削除済みの要素は出さない", () => {
    expect(
      relationCandidates(activity, elements, "").map((c) => c.element.name),
    ).toEqual(["申込画面", "審査担当"]);
  });

  it("名前で候補を絞る", () => {
    expect(
      relationCandidates(activity, elements, " 審査 ").map((c) => c.element.id),
    ).toEqual(["u2"]);
  });

  it("相手の側でつながりを持つ組は、逆向きとして示す", () => {
    const lonely = elementSnapshot("a2", "activity", { name: "審査する" });
    const candidates = relationCandidates(
      lonely,
      [...elements, lonely],
      "申込受付",
    );
    expect(candidates).toEqual([
      { element: flow, kindLabel: "業務フロー", reversed: true },
    ]);
  });
});
