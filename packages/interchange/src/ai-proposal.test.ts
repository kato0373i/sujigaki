import { AT, elementSnapshot } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { readProposal } from "./ai-proposal.ts";

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
    const result = readProposal(reply, [actor, existing], AT);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const added = result.elements.find((e) => e.id === "new-1");
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
    const result = readProposal(reply, [actor, existing], AT);
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
    );
    expect(result.ok ? [] : result.issues.map((i) => i.message)).toEqual([
      "「活動」の要素は、つながりの種類「usecase-screen」を持てません。",
      "要素の ID「a1」が重なっています。",
    ]);
  });

  it("提案の形式でなければ読まない", () => {
    const result = readProposal("format: sujigaki\nversion: 1\n", [], AT);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ message: "sujigaki の提案の形式ではありません。" }],
    });
  });
});
