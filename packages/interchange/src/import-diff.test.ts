import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { changedFields, diffElements } from "./import-diff.ts";

const actorA = elementSnapshot("actorA", "actor");
const actorB = elementSnapshot("actorB", "actor");
const check = elementSnapshot("a1", "activity", {
  name: "申込内容を確認する",
  reviewState: "approved",
  version: 4,
  relations: [relationTo(actorA, "activity")],
});
const notify = elementSnapshot("a2", "activity", {
  name: "審査結果を通知する",
  reviewState: "approved",
});

describe("FR-050 FR-034 取り込みの差分", () => {
  it("担当者だけを変えた要素を、つながりの変更として出す", () => {
    const incoming = [
      { ...check, relations: [relationTo(actorB, "activity")] },
      notify,
      actorA,
      actorB,
    ];
    const diff = diffElements([check, notify, actorA, actorB], incoming, {
      removeMissing: false,
    });
    expect(diff.problems).toEqual([]);
    expect(diff.changes).toEqual([
      {
        type: "update",
        elementId: "a1",
        baseVersion: 4,
        fields: ["relations"],
        restores: false,
        before: check,
        after: incoming[0],
      },
    ]);
  });

  it("確認状態・バージョン・日時が違うだけなら、変更にしない", () => {
    const incoming = {
      ...notify,
      reviewState: "unreviewed" as const,
      version: 9,
      updatedAt: "2030-01-01T00:00:00.000Z",
    };
    expect(changedFields(notify, incoming)).toEqual([]);
  });

  it("つながりの ID が違っても、種類と先が同じなら同じつながりとして扱う", () => {
    const renamed = {
      ...check,
      relations: [{ ...relationTo(actorA, "activity"), id: "other" as never }],
    };
    expect(changedFields(check, renamed)).toEqual([]);
  });

  it("新しい要素は追加にし、取り込む側にない要素は指定したときだけ削除にする", () => {
    const added = elementSnapshot("a3", "activity");
    const partial = diffElements([check, notify], [added], {
      removeMissing: false,
    });
    expect(partial.changes.map((c) => c.type)).toEqual(["add"]);
    const full = diffElements([check, notify], [added], {
      removeMissing: true,
    });
    expect(
      full.changes.map((c) => [
        c.type,
        "elementId" in c ? c.elementId : c.element.id,
      ]),
    ).toEqual([
      ["add", "a3"],
      ["remove", "a1"],
      ["remove", "a2"],
    ]);
  });

  it("取り込む側で削除済みの要素は、今あれば削除にし、なければ無視する", () => {
    const deleted = { ...notify, deletedAt: "2026-11-19T00:00:00.000Z" };
    const unknown = elementSnapshot("zz", "actor", {
      deletedAt: "2026-11-19T00:00:00.000Z",
    });
    const diff = diffElements([notify], [deleted, unknown], {
      removeMissing: false,
    });
    expect(diff.changes).toEqual([
      { type: "remove", elementId: "a2", baseVersion: 1, before: notify },
    ]);
  });

  it("今は削除済みの要素を取り込むと、復元する変更にする", () => {
    const deleted = { ...notify, deletedAt: "2026-11-19T00:00:00.000Z" };
    const diff = diffElements([deleted], [notify], { removeMissing: false });
    expect(diff.changes).toMatchObject([
      { type: "update", elementId: "a2", fields: [], restores: true },
    ]);
  });

  it("要素の種類が違うときは、取り込めない要素として返す", () => {
    const diff = diffElements([notify], [{ ...notify, kind: "usecase" }], {
      removeMissing: false,
    });
    expect(diff.changes).toEqual([]);
    expect(diff.problems).toEqual([
      {
        elementId: "a2",
        message:
          "要素「審査結果を通知する」は今のモデルでは「活動」です。要素の種類は変えられません。",
      },
    ]);
  });

  it("名前・要約・属性・外部リンクの違いを、項目ごとに出す", () => {
    const changed = {
      ...notify,
      name: "結果を通知する",
      summary: "メールで送る",
      attributes: { mode: "system" },
      links: [
        {
          id: "l1",
          kind: "manual" as const,
          url: "https://example.com",
          label: null,
        },
      ],
    };
    expect(changedFields(notify, changed)).toEqual([
      "name",
      "summary",
      "attributes",
      "links",
    ]);
  });
});
