import { ACTORS, elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { diffElements } from "@sujigaki/interchange";
import { describe, expect, it } from "vitest";
import { changeRows, changeSetBody, restoreNotice } from "./import-review.ts";

const actorA = elementSnapshot("u1", "actor", { name: "受付担当" });
const actorB = elementSnapshot("u2", "actor", { name: "審査担当" });
const activity = elementSnapshot("a1", "activity", {
  name: "申込を確認する",
  version: 3,
  attributes: { mode: "manual" },
  relations: [relationTo(actorA, "activity")],
});
const removed = elementSnapshot("a9", "activity", { name: "古い活動" });
const current = [actorA, actorB, activity, removed];
const changed = {
  ...activity,
  name: "申込内容を確認する",
  attributes: { mode: "system" },
  relations: [relationTo(actorB, "activity")],
};
const added = elementSnapshot("a2", "activity", { name: "審査する" });
const { changes } = diffElements(current, [actorA, actorB, changed, added], {
  removeMissing: true,
});

describe("S-09 取り込みの差分", () => {
  it("追加・変更・削除を、種類の表示名と一緒に出す", () => {
    expect(
      changeRows(changes, current).map((r) => [
        r.change.type,
        r.kindLabel,
        r.name,
      ]),
    ).toEqual([
      ["update", "活動", "申込内容を確認する"],
      ["add", "活動", "審査する"],
      ["remove", "活動", "古い活動"],
    ]);
  });

  it("変更は項目ごとに今の内容と取り込む内容を並べ、つながりは先の要素の名前で出す", () => {
    expect(changeRows(changes, current)[0]?.differences).toEqual([
      { label: "名前", before: "申込を確認する", after: "申込内容を確認する" },
      { label: "区分", before: "手作業", after: "システム利用" },
      {
        label: "つながり",
        before: "登場人物「受付担当」",
        after: "登場人物「審査担当」",
      },
    ]);
  });

  it("採用した変更を、変更の一式の API の本文にする。確認状態とバージョンは送らない", () => {
    const body = changeSetBody(changes, {
      authorType: "import",
      source: "YAML の取り込み",
    });
    expect(body.changes).toEqual([
      {
        type: "update",
        baseVersion: 3,
        element: {
          id: "a1",
          kind: "activity",
          name: "申込内容を確認する",
          summary: "",
          attributes: { mode: "system" },
          links: [],
          relations: [{ id: "r-u2", typeId: "activity-actor", to: "u2" }],
        },
      },
      {
        type: "add",
        element: expect.objectContaining({ id: "a2", name: "審査する" }),
      },
      { type: "remove", elementId: "a9", baseVersion: 1 },
    ]);
  });

  it("FR-050 復元の前に、自分のロールで確認状態が保たれるかを示す", () => {
    expect(restoreNotice(ACTORS.owner)).toBe(
      "確認状態はファイルのとおりに保たれます。",
    );
    expect(restoreNotice(ACTORS.editor)).toBe(
      "業務責任者以上でないため、すべての要素が未レビューになります。",
    );
  });
});
