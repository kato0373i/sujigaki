import { AT, elementSnapshot } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { readProposal } from "./ai-proposal.ts";

let sequence = 0;
/** 新しい要素に付ける ID。テストでは番号で見分ける */
const newId = () => `id${++sequence}`;

const actor = elementSnapshot("actor1", "actor", { name: "審査担当" });
const existing = elementSnapshot("act1", "activity", {
  name: "申込を確認する",
  summary: "書類を見る",
  version: 3,
  links: [
    { id: "l1", kind: "manual", url: "https://example.com", label: null },
  ],
});

const reply = `提案です。

\`\`\`yaml
format: sujigaki-proposal
version: 1
elements:
  - id: act1
    kind: activity
    name: 申込内容を確認する
    reviewState: approved
    relations:
      - { type: activity-actor, to: actor1 }
  - id: new-1
    kind: activity
    name: 審査結果を通知する
    attributes: { mode: system }
questions:
  - { elementId: act1, body: 例外のときは誰に連絡しますか, recommendation: 研修担当 }
\`\`\`
`;

describe("FR-034 AI の提案を読む", () => {
  it("コードブロックの中を読み、要素を未レビュー・作成者の種類 AI にする", () => {
    const result = readProposal(reply, [actor, existing], AT, newId);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const added = result.elements.find((e) => e.name === "審査結果を通知する");
    expect(added).toMatchObject({
      kind: "activity",
      reviewState: "unreviewed",
      authorType: "ai",
      attributes: { mode: "system" },
      version: 1,
    });
    expect(result.questions).toEqual([
      {
        elementId: "act1",
        body: "例外のときは誰に連絡しますか",
        recommendation: "研修担当",
      },
    ]);
  });

  it("今のモデルにある要素は、外部リンク・要約・バージョンを今のまま保つ", () => {
    const result = readProposal(reply, [actor, existing], AT, newId);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.elements.find((e) => e.id === "act1")).toMatchObject({
      name: "申込内容を確認する",
      summary: "書類を見る",
      version: 3,
      links: existing.links,
      relations: [expect.objectContaining({ to: "actor1", toKind: "actor" })],
    });
  });

  it("形式に合わない返答は、行番号を付けて読まない", () => {
    const result = readProposal(
      "format: sujigaki-proposal\nversion: 1\nelements:\n  - id: a1\n    kind: activity\n    name: 確認する\n    attributes: { mode: auto }\n",
      [],
      AT,
      newId,
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: ["elements", 0, "attributes", "mode"], line: 7 }],
    });
  });

  it("持てないつながりの種類と、ID の重なりを返す", () => {
    const result = readProposal(
      `format: sujigaki-proposal
version: 1
elements:
  - { id: a1, kind: activity, name: 確認する, relations: [{ type: usecase-screen, to: s1 }] }
  - { id: a1, kind: activity, name: 確認する }
`,
      [],
      AT,
      newId,
    );
    expect(result.ok ? [] : result.issues.map((i) => i.message)).toEqual([
      "「活動」の要素は、つながりの種類「usecase-screen」を持てません。",
      "要素の ID「a1」が重なっています。",
    ]);
  });

  it("提案の形式でなければ読まない", () => {
    const result = readProposal(
      "format: sujigaki\nversion: 1\n",
      [],
      AT,
      newId,
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ message: "sujigaki の提案の形式ではありません。" }],
    });
  });
});

describe("#110 新しい要素の仮の ID", () => {
  it("new- で始まる ID と今のモデルにない ID は新しい ID に置き換え、つながりの先と問いの要素も合わせる", () => {
    const ids = ["x1", "x2"];
    const result = readProposal(
      `format: sujigaki-proposal
version: 1
elements:
  - id: new-a1
    kind: activity
    name: 請求書を発行する
    relations: [{ type: activity-actor, to: invented }]
  - { id: invented, kind: actor, name: 経理担当 }
questions:
  - { elementId: new-a1, body: 締め日はいつですか }
`,
      [actor, existing],
      AT,
      () => ids.shift() as string,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.elements.map((e) => [e.id, e.name])).toEqual([
      ["x1", "請求書を発行する"],
      ["x2", "経理担当"],
    ]);
    expect(result.elements[0]?.relations).toEqual([
      expect.objectContaining({ to: "x2", id: "x1-activity-actor-x2" }),
    ]);
    expect(result.questions[0]?.elementId).toBe("x1");
  });

  it("今のモデルに new- で始まる要素があっても、提案の new- は新しい要素にする", () => {
    const legacy = elementSnapshot("new-a1", "activity", {
      name: "注文を受け付ける",
    });
    const result = readProposal(
      "format: sujigaki-proposal\nversion: 1\nelements:\n  - { id: new-a1, kind: activity, name: 請求書を発行する }\n",
      [legacy],
      AT,
      () => "x9",
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.elements).toEqual([
      expect.objectContaining({
        id: "x9",
        name: "請求書を発行する",
        version: 1,
      }),
    ]);
  });
});
