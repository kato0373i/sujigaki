import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { diffElements } from "./import-diff.ts";
import { exportRelatedData } from "./rdra-export.ts";
import { readRelatedData } from "./rdra-import.ts";

const at = new Date("2026-11-20T00:00:00Z");
let sequence = 0;
const newId = () => `new${++sequence}`;

const reception = elementSnapshot("u1", "actor", {
  name: "受付担当",
  summary: "申込を受け付ける人",
});
const info = elementSnapshot("i1", "information", {
  name: "申込",
  attributes: { items: [{ name: "申込日", description: "受け付けた日" }] },
});
const confirm = elementSnapshot("a1", "activity", {
  name: "申込を確認する",
  attributes: { mode: "manual", trigger: "申込が届いたとき" },
  relations: [relationTo(reception, "activity"), relationTo(info, "activity")],
});
const flow = elementSnapshot("f1", "buc", {
  name: "申込受付",
  summary: "BUC には #comment の行がない",
  relations: [relationTo(confirm, "buc")],
});
const business = elementSnapshot("b1", "business", {
  name: "申込",
  relations: [relationTo(flow, "business")],
});
const requirement = elementSnapshot("r1", "requirement", {
  name: "早く受け付けたい",
  relations: [relationTo(business, "requirement")],
});
const lonely = elementSnapshot("t1", "timer", { name: "毎月の締め" });
const model = [business, flow, confirm, reception, info, requirement, lonely];

function read(text: string, current = model) {
  const result = readRelatedData(text, current, at, newId);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.elements;
}

describe("FR-052 関連データの読み込み", () => {
  it("書き出した関連データを同じモデルに読み込むと、差分が出ない", () => {
    const { text } = exportRelatedData("申込システム", model);
    expect(
      diffElements(model, read(text), { removeMissing: true }).changes,
    ).toEqual([]);
  });

  it("空のモデルに読み込むと、未レビュー・出所「RDRA 読み込み」の要素を作り、つながりを名前で結ぶ", () => {
    const elements = read(
      "申込システム\n#edge\tアクティビティ\tアクター\t申込を確認する@@受付担当\n#comment\tアクター\t説明\t受付担当@@窓口の人\n",
      [],
    );
    expect(elements.map((e) => [e.kind, e.name, e.summary])).toEqual([
      ["activity", "申込を確認する", ""],
      ["actor", "受付担当", "窓口の人"],
    ]);
    const [activity, actor] = elements;
    expect(activity).toMatchObject({
      reviewState: "unreviewed",
      authorType: "import",
      source: "RDRA 読み込み",
      relations: [{ typeId: "activity-actor", to: actor?.id, toKind: "actor" }],
    });
  });

  it("関連データにない要素は削除の変更にする。要求と、つながりのない要素は残す", () => {
    const { text } = exportRelatedData("申込システム", model);
    const renamed = text.replaceAll("受付担当", "窓口担当");
    const changes = diffElements(model, read(renamed), {
      removeMissing: true,
    }).changes;
    expect(
      changes.map((c) =>
        c.type === "add" ? ["add", c.element.name] : [c.type, c.before.name],
      ),
    ).toEqual([
      ["update", "申込を確認する"],
      ["add", "窓口担当"],
      ["remove", "受付担当"],
    ]);
  });

  it("関連データで表せる属性だけを合わせ、項目の説明と業務手順の属性は残す", () => {
    const text = [
      "申込システム",
      "#edge\tアクティビティ\tアクター\t申込を確認する@@受付担当",
      "#edge\tアクティビティ\t情報\t申込を確認する@@申込",
      "#attribute\t情報\t属性\t申込@@申込日//申込@@氏名",
      "#comment\tアクター\t説明\t受付担当@@申込を受け付ける人",
    ].join("\n");
    const elements = read(text);
    expect(elements.find((e) => e.id === "i1")?.attributes).toEqual({
      items: [
        { name: "申込日", description: "受け付けた日" },
        { name: "氏名" },
      ],
    });
    expect(elements.find((e) => e.id === "a1")?.attributes).toEqual({
      mode: "manual",
      trigger: "申込が届いたとき",
    });
  });

  it("区分の値と状態のステレオタイプを読む", () => {
    const elements = read(
      "#attribute\tバリエーション\t値\t申込の種類@@個人//申込の種類@@法人\n#stereotype\t状態\tStereotype\t受付済み@@開始",
      [],
    );
    expect(elements.map((e) => e.attributes)).toEqual([
      { values: ["個人", "法人"] },
      { stereotype: "開始" },
    ]);
  });

  it("形式に合わない行は、行番号を付けてすべて返す", () => {
    const result = readRelatedData(
      [
        "申込システム",
        "#edge\tアクティビティ",
        "#edge\tアクティビティ\t要求\ta@@b",
        "#edge\tアクティビティ\tアクター\t申込を確認する",
        "説明の行",
      ].join("\n"),
      model,
      at,
      newId,
    );
    expect(result).toEqual({
      ok: false,
      issues: [
        {
          path: [],
          line: 2,
          message:
            "列の数が合いません。タグ・元の種類・先の種類・名前の組の4列を、タブで区切ってください。",
        },
        {
          path: [],
          line: 3,
          message:
            "「#edge アクティビティ → 要求」の行は、関連データの形式にありません。",
        },
        {
          path: [],
          line: 4,
          message:
            "「申込を確認する」は「元の名前@@先の名前」の形になっていません。",
        },
        {
          path: [],
          line: 5,
          message: "タグ（#child など）で始まらない行です。",
        },
      ],
    });
  });

  it("空の関連データと、名前の組がない関連データは読み込まない", () => {
    expect(readRelatedData("\n", model, at, newId)).toMatchObject({
      ok: false,
      issues: [{ line: 1, message: "関連データが空です。" }],
    });
    expect(
      readRelatedData("申込システム\n#edge\tUC\t画面\t", model, at, newId),
    ).toMatchObject({
      ok: false,
      issues: [{ message: "関連データに、要素の名前の組が1つもありません。" }],
    });
  });

  it("今のモデルに同じ種類で同じ名前の要素が2つあれば、対応づけずに知らせる", () => {
    const twin = elementSnapshot("u2", "actor", { name: "受付担当" });
    const result = readRelatedData(
      "#edge\tアクティビティ\tアクター\t申込を確認する@@受付担当",
      [...model, twin],
      at,
      newId,
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          line: 1,
          message:
            "今のモデルに、名前が「受付担当」の登場人物が2つあるため、対応づけられません。名前を変えてから読み込んでください。",
        },
      ],
    });
  });
});
