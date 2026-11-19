import { elementSnapshot } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import {
  changesOf,
  conflictRows,
  draftOf,
  resetsReview,
} from "./element-editor.ts";

const activity = elementSnapshot("a1", "activity", {
  name: "申込を確認する",
  attributes: {
    mode: "manual",
    exceptions: ["書類の不足", "期限切れ"],
    legacy: "残す",
  },
  reviewState: "approved",
});

describe("P-01 詳細パネルの編集", () => {
  it("今の内容を入力欄の文字列にする。一覧は1行に1つずつにする", () => {
    expect(draftOf(activity)).toEqual({
      name: "申込を確認する",
      summary: "",
      attributes: {
        mode: "manual",
        trigger: "",
        input: "",
        procedure: "",
        exceptions: "書類の不足\n期限切れ",
        outcome: "",
      },
    });
  });

  it("変えていなければ、保存する変更はない", () => {
    expect(changesOf(activity, draftOf(activity))).toBeNull();
  });

  it("変えた項目だけを保存する。空の項目は持たず、入力欄にない属性は残す", () => {
    const draft = draftOf(activity);
    const changes = changesOf(activity, {
      ...draft,
      attributes: {
        ...draft.attributes,
        trigger: " 申込書が届く ",
        exceptions: "書類の不足\n\n",
      },
    });
    expect(changes).toEqual({
      attributes: {
        legacy: "残す",
        mode: "manual",
        trigger: "申込書が届く",
        exceptions: ["書類の不足"],
      },
    });
  });

  it("FR-013 確認済みの要素の内容を変えると、未レビューに戻ることを知らせる", () => {
    const changes = changesOf(activity, {
      ...draftOf(activity),
      name: "確認する",
    });
    expect(resetsReview(activity, changes)).toBe(true);
    expect(resetsReview(activity, null)).toBe(false);
    expect(
      resetsReview({ ...activity, reviewState: "unreviewed" }, changes),
    ).toBe(false);
  });

  it("D-01 自分が変えた項目ごとに、自分の内容と今の内容を並べ、違う行を示す", () => {
    const current = {
      ...activity,
      name: "申込内容を確かめる",
      attributes: { mode: "system" },
    };
    const rows = conflictRows(
      { name: "確認する", attributes: { mode: "system" } },
      current,
    );
    expect(rows).toEqual([
      {
        label: "名前",
        mine: "確認する",
        current: "申込内容を確かめる",
        differs: true,
      },
      {
        label: "区分",
        mine: "システム利用",
        current: "システム利用",
        differs: false,
      },
    ]);
  });
});
