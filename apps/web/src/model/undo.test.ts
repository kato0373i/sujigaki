import type { ElementSnapshot } from "@sujigaki/domain";
import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { mergeChanges, undoPlan, updateLabel } from "./undo.ts";

const reception = elementSnapshot("actor-1", "actor", { name: "受付担当" });
const activity = elementSnapshot("act-1", "activity", {
  name: "申込を確認する",
  version: 3,
  relations: [relationTo(reception, "activity")],
});
const unlinked: ElementSnapshot = { ...activity, relations: [], version: 4 };
const current = (...elements: ElementSnapshot[]) =>
  new Map(elements.map((e) => [e.id as string, e]));

describe("FR-014 元に戻す変更", () => {
  it("外したつながりは、操作の前の内容に戻す。バージョンは今の要素のものを使う", () => {
    const reviewed: ElementSnapshot = {
      ...unlinked,
      version: 5,
      reviewState: "approved",
    };
    const plan = undoPlan(
      {
        label: "「申込を確認する」のつながりの解除",
        changes: [{ before: activity, after: unlinked }],
      },
      // 確認状態だけが変わった要素は、内容が同じとみなして戻す
      current(reviewed, reception),
    );
    expect(plan).toEqual({
      ok: true,
      changes: [
        {
          type: "update",
          baseVersion: 5,
          element: expect.objectContaining({
            id: "act-1",
            relations: [
              expect.objectContaining({
                to: "actor-1",
                typeId: "activity-actor",
              }),
            ],
          }),
        },
      ],
    });
  });

  it("追加した要素は削除にし、削除した要素は内容を戻して復元する", () => {
    const created = elementSnapshot("actor-2", "actor", { name: "経理担当" });
    const deleted: ElementSnapshot = {
      ...reception,
      version: 2,
      deletedAt: "2026-11-20T00:00:00.000Z",
    };
    const plan = undoPlan(
      {
        label: "2件の変更の反映",
        changes: [
          { before: null, after: created },
          { before: reception, after: deleted },
        ],
      },
      current(created, deleted),
    );
    expect(plan.ok && plan.changes.map((c) => c.type)).toEqual([
      "remove",
      "update",
    ]);
  });

  it("操作のあとで内容が変わった要素があれば、何も戻さずに理由を返す", () => {
    const edited: ElementSnapshot = { ...unlinked, summary: "書類を見る" };
    expect(
      undoPlan(
        { label: "x", changes: [{ before: activity, after: unlinked }] },
        current(edited),
      ),
    ).toEqual({
      ok: false,
      message:
        "「申込を確認する」はこの操作のあとに変わったため、元に戻せません。",
    });
    expect(
      undoPlan(
        { label: "x", changes: [{ before: activity, after: unlinked }] },
        current(),
      ),
    ).toEqual({
      ok: false,
      message: "「申込を確認する」が見つからないため、元に戻せません。",
    });
  });

  it("同じ要素が何度も変わったら、最初の前と最後の後にまとめる", () => {
    const created = elementSnapshot("act-2", "activity", { name: "通知する" });
    const connected: ElementSnapshot = {
      ...created,
      version: 2,
      relations: [relationTo(reception, "activity")],
    };
    expect(
      mergeChanges([
        { before: null, after: created },
        { before: created, after: connected },
      ]),
    ).toEqual([{ before: null, after: connected }]);
  });

  it("内容の保存の説明は、変えた項目で言い方を変える", () => {
    expect(updateLabel(activity, { links: [] })).toBe(
      "「申込を確認する」の外部リンクの変更",
    );
    expect(updateLabel(activity, { name: "確認する" })).toBe(
      "「申込を確認する」の名前の変更",
    );
    expect(updateLabel(activity, { name: "確認する", summary: "" })).toBe(
      "「申込を確認する」の内容の変更",
    );
  });
});
