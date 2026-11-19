import { elementId } from "@sujigaki/domain";
import {
  elementSnapshot,
  questionSnapshot,
  relationTo,
} from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import version1 from "../fixtures/v1/project.yaml?raw";
import type { ProjectDocument } from "./document.ts";
import { readProjectYaml, writeProjectYaml } from "./project-yaml.ts";

const project = {
  name: "申込管理",
  systemName: "申込システム",
  summaryMaxLength: 100,
};
const actor = elementSnapshot("actor1", "actor");
const activity = elementSnapshot("act1", "activity", {
  name: "申込内容を確認する",
  attributes: { mode: "manual" },
  reviewState: "approved",
  relations: [relationTo(actor, "activity")],
});

const document: ProjectDocument = {
  project,
  elements: [activity, actor],
  questions: [questionSnapshot("act1")],
  decisions: [],
  layouts: [
    {
      bucId: elementId("buc1"),
      version: 1,
      updatedAt: "2026-11-19T00:00:00.000Z",
      positions: { [elementId("act1")]: { x: 10, y: 20 } },
    },
  ],
};

function issuesOf(text: string) {
  const result = readProjectYaml(text);
  if (result.ok) throw new Error("読み込めてしまった");
  return result.issues;
}

const header = `format: sujigaki
version: 1
project:
  name: 申込管理
  systemName: 申込システム
`;

describe("FR-050 YAML に書き出す", () => {
  it("要素を ID の順に並べ、既定の値と同じ項目は書かない", () => {
    const text = writeProjectYaml(document);
    expect(text.indexOf("id: act1")).toBeLessThan(text.indexOf("id: actor1"));
    expect(text).not.toContain("summary:");
    expect(text).not.toContain("summaryMaxLength:");
    expect(text).not.toContain("deletedAt:");
  });

  it("並びが違っても、同じモデルなら同じ YAML になる", () => {
    const reversed = { ...document, elements: [actor, activity] };
    expect(writeProjectYaml(reversed)).toBe(writeProjectYaml(document));
  });

  it("書き出して読み込むと、元のモデルに戻る", () => {
    const result = readProjectYaml(writeProjectYaml(document));
    expect(result).toEqual({
      ok: true,
      document: { ...document, elements: [activity, actor] },
    });
  });

  it("要約の上限が既定と違うときだけ書く", () => {
    const text = writeProjectYaml({
      ...document,
      project: { ...project, summaryMaxLength: 200 },
    });
    expect(text).toContain("summaryMaxLength: 200");
  });
});

describe("FR-050 YAML を読み込む", () => {
  it("形式のバージョン1のファイルを読み込める（NFR-015）", () => {
    const result = readProjectYaml(version1);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const act = result.document.elements.find((e) => e.id === "act1");
    expect(act).toMatchObject({
      kind: "activity",
      reviewState: "approved",
      attributes: { trigger: "申込書が届く", mode: "system" },
      summary: "",
      deletedAt: null,
    });
    expect(act?.relations.map((r) => r.toKind)).toEqual(["actor", "usecase"]);
    expect(result.document.project.summaryMaxLength).toBe(100);
    expect(result.document.layouts[0]?.positions).toEqual({
      act1: { x: 10, y: 20 },
    });
  });

  it("スキーマに合わない箇所を、行番号付きで返す", () => {
    const text = `${header}elements:
  - id: act1
    kind: activity
    name: 申込内容を確認する
    attributes:
      mode: auto
    createdAt: 2026-11-19T00:00:00.000Z
    updatedAt: 2026-11-19T00:00:00.000Z
`;
    expect(issuesOf(text)).toEqual([
      {
        path: ["elements", 0, "attributes", "mode"],
        line: 11,
        message: '無効な選択: "manual"、"system"のいずれかである必要があります',
      },
    ]);
  });

  it("ファイル名に使えない文字の ID は読み込まない", () => {
    const text = `${header}elements:
  - id: ../a1
    kind: actor
    name: 審査担当
    createdAt: 2026-11-19T00:00:00.000Z
    updatedAt: 2026-11-19T00:00:00.000Z
`;
    expect(issuesOf(text)).toEqual([
      {
        path: ["elements", 0, "id"],
        line: 7,
        message: "ID に使えるのは、英数字と「-」「_」だけです。",
      },
    ]);
  });

  it("要素の種類がなければ、そのことを返す", () => {
    const text = `${header}elements:
  - id: x1
    kind: unknown
    name: 何か
`;
    expect(issuesOf(text)).toEqual([
      {
        path: ["elements", 0, "kind"],
        line: 8,
        message: "要素の種類が正しくありません。",
      },
    ]);
  });

  it("YAML として読めなければ、その行を返す", () => {
    const issues = issuesOf(`${header}elements: [\n`);
    expect(issues[0]?.message).toMatch(/^YAML として読めません/);
    expect(issues[0]?.line).toBeGreaterThan(0);
  });

  it("sujigaki のファイルでなければ読み込まない", () => {
    expect(issuesOf("- a\n- b\n")[0]?.message).toBe(
      "sujigaki の YAML ファイルではありません。",
    );
    expect(issuesOf("format: other\nversion: 1\n")[0]).toMatchObject({
      path: ["format"],
      line: 1,
      message: "sujigaki の YAML ファイルではありません。",
    });
  });

  it("新しいバージョンの形式は、更新を促して読み込まない", () => {
    expect(issuesOf("format: sujigaki\nversion: 2\n")).toEqual([
      {
        path: ["version"],
        line: 2,
        message:
          "このファイルは新しいバージョン（2）の形式です。sujigaki を更新してから読み込んでください。",
      },
    ]);
  });

  it("ID の重なりと、持てないつながりの種類を返す", () => {
    const element = (id: string, relations: string) => `  - id: ${id}
    kind: usecase
    name: 登録する
    relations:
${relations}    createdAt: 2026-11-19T00:00:00.000Z
    updatedAt: 2026-11-19T00:00:00.000Z
`;
    const text = `${header}elements:
${element("u1", "      - { id: r1, type: usecase-screen, to: s1 }\n      - { id: r1, type: usecase-screen, to: s1 }\n")}${element("u1", "      - { id: r2, type: activity-actor, to: a1 }\n      - { id: r3, type: no-such, to: a1 }\n")}`;
    expect(issuesOf(text).map((i) => i.message)).toEqual([
      "要素の ID「u1」が重なっています。",
      "つながりの ID「r1」が重なっています。",
      "同じ種類で同じ先へのつながりが重なっています。",
      "「システム操作」の要素は、つながりの種類「activity-actor」を持てません。",
      "つながりの種類「no-such」はありません。",
    ]);
  });

  it("問い・決定記録・図の配置の重なりを返す", () => {
    const text = `${header}questions:
  - { id: q1, elementId: a1, body: 誰ですか, authorType: human, createdAt: 2026-11-19T00:00:00.000Z }
  - { id: q1, elementId: a1, body: 誰ですか, authorType: human, createdAt: 2026-11-19T00:00:00.000Z }
decisions:
  - { id: d1, topic: 担当, conclusion: 受付, reason: 近い, elementIds: [a1], decidedAt: 2026-11-19T00:00:00.000Z }
  - { id: d1, topic: 担当, conclusion: 受付, reason: 近い, elementIds: [a1], decidedAt: 2026-11-19T00:00:00.000Z }
layouts:
  - { bucId: b1, version: 1, positions: {} }
  - { bucId: b1, version: 1, positions: {} }
`;
    expect(issuesOf(text)).toEqual([
      {
        path: ["questions", 1, "id"],
        line: 8,
        message: "問いの ID「q1」が重なっています。",
      },
      {
        path: ["decisions", 1, "id"],
        line: 11,
        message: "決定記録の ID「d1」が重なっています。",
      },
      {
        path: ["layouts", 1, "bucId"],
        line: 14,
        message: "業務フロー「b1」の図の配置が重なっています。",
      },
    ]);
  });
});
