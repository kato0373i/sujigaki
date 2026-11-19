import { elementId } from "@sujigaki/domain";
import {
  elementSnapshot,
  questionSnapshot,
  relationTo,
} from "@sujigaki/domain/testing";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizeDocument, type ProjectDocument } from "./document.ts";
import {
  isProjectFile,
  readProjectFolder,
  writeProjectFolder,
} from "./project-folder.ts";
import { documentArbitrary } from "./testing/arbitraries.ts";

const act = elementSnapshot("act1", "activity", { name: "申込を受け付ける" });
const buc = elementSnapshot("buc1", "buc", {
  relations: [relationTo(act, "buc")],
});
const business = elementSnapshot("biz1", "business", {
  name: "申込受付",
  relations: [relationTo(buc, "business")],
});
const lonely = elementSnapshot("act9", "activity");
const state = elementSnapshot("st1", "state");
const stateModel = elementSnapshot("sm1", "stateModel", {
  relations: [relationTo(state, "stateModel")],
});
const info = elementSnapshot("info1", "information");
const context = elementSnapshot("ctx1", "context", {
  name: "申込",
  relations: [relationTo(info, "context"), relationTo(stateModel, "context")],
});
const variation = elementSnapshot("var1", "variation");

const document: ProjectDocument = {
  project: {
    name: "申込管理",
    systemName: "申込システム",
    summaryMaxLength: 100,
  },
  elements: [
    act,
    buc,
    business,
    lonely,
    state,
    stateModel,
    info,
    context,
    variation,
    elementSnapshot("actor1", "actor"),
    elementSnapshot("req1", "requirement"),
    elementSnapshot("uc1", "usecase"),
    elementSnapshot("scr1", "screen"),
  ],
  questions: [questionSnapshot("act1")],
  decisions: [],
  layouts: [
    { bucId: elementId("buc1"), version: 1, updatedAt: null, positions: {} },
  ],
};

const files = writeProjectFolder(document);

function issuesOf(changes: Record<string, string>) {
  const result = readProjectFolder(
    new Map([...files, ...Object.entries(changes)]),
  );
  if (result.ok) throw new Error("読み込めてしまった");
  return result.issues;
}

describe("FR-061 ローカルモードのフォルダーに分けて書き出す", () => {
  it("業務・分類・種類ごとのファイルに分け、中身のないファイルは作らない", () => {
    expect([...files.keys()].sort()).toEqual([
      "actors.yaml",
      "businesses/biz1.yaml",
      "businesses/unassigned.yaml",
      "contexts/ctx1.yaml",
      "contexts/unassigned.yaml",
      "deliberation.yaml",
      "layouts/buc1.yaml",
      "requirements.yaml",
      "sujigaki.yaml",
      "system/screens.yaml",
      "system/usecases.yaml",
    ]);
  });

  it("業務のファイルには、業務と、その下の業務フローと活動を置く", () => {
    const text = files.get("businesses/biz1.yaml") ?? "";
    expect(text.startsWith("# 業務: 申込受付\n")).toBe(true);
    expect([...text.matchAll(/^ {2}- id: (\S+)$/gm)].map((m) => m[1])).toEqual([
      "act1",
      "biz1",
      "buc1",
    ]);
  });

  it("分類のファイルには、分類と、その下の情報・状態の流れ・状態を置く", () => {
    const text = files.get("contexts/ctx1.yaml") ?? "";
    expect(text.startsWith("# 分類: 申込\n")).toBe(true);
    expect([...text.matchAll(/^ {2}- id: (\S+)$/gm)].map((m) => m[1])).toEqual([
      "ctx1",
      "info1",
      "sm1",
      "st1",
    ]);
  });

  it("業務や分類に属さない要素は、unassigned のファイルに置く", () => {
    expect(files.get("businesses/unassigned.yaml")).toContain("id: act9");
    expect(files.get("contexts/unassigned.yaml")).toContain("id: var1");
  });

  it("書き出して読み込むと、元のモデルに戻る", () => {
    expect(readProjectFolder(files)).toEqual({
      ok: true,
      document: normalizeDocument(document),
    });
  });

  it("どのモデルでも、書き出して読み込むと元に戻る", () => {
    fc.assert(
      fc.property(documentArbitrary, (doc) => {
        const result = readProjectFolder(writeProjectFolder(doc));
        if (!result.ok) throw new Error(JSON.stringify(result.issues));
        expect(result.document).toEqual(normalizeDocument(doc));
      }),
    );
  });
});

describe("FR-061 ローカルモードのフォルダーを読み込む", () => {
  it("要素が決まったファイルになくても読み込む", () => {
    const moved = new Map(files);
    moved.set("requirements.yaml", `${files.get("requirements.yaml")}`);
    moved.set(
      "system/usecases.yaml",
      `${files.get("system/usecases.yaml")}${(files.get("system/screens.yaml") ?? "").replace("elements:\n", "")}`,
    );
    moved.delete("system/screens.yaml");
    const result = readProjectFolder(moved);
    expect(result.ok && result.document.elements.map((e) => e.id)).toContain(
      "scr1",
    );
  });

  it("sujigaki のファイルでないものは読まない", () => {
    expect(isProjectFile("README.md")).toBe(false);
    expect(isProjectFile("notes/memo.yaml")).toBe(false);
    expect(isProjectFile("businesses/../x.yaml")).toBe(false);
    expect(isProjectFile("businesses/biz1.yaml")).toBe(true);
    const result = readProjectFolder(
      new Map([...files, ["notes/memo.yaml", "壊れた: [YAML"]]),
    );
    expect(result.ok).toBe(true);
  });

  it("合わない箇所を、ファイルと行番号付きで返す", () => {
    const text = (files.get("businesses/biz1.yaml") ?? "").replace(
      "kind: activity\n",
      "kind: activity\n    attributes:\n      mode: auto\n",
    );
    expect(issuesOf({ "businesses/biz1.yaml": text })).toEqual([
      {
        file: "businesses/biz1.yaml",
        path: ["elements", 0, "attributes", "mode"],
        line: 7,
        message: '無効な選択: "manual"、"system"のいずれかである必要があります',
      },
    ]);
  });

  it("ファイルをまたいで ID が重なっていれば、あとのファイルの箇所を返す", () => {
    const issues = issuesOf({
      "system/usecases.yaml": (files.get("system/usecases.yaml") ?? "").replace(
        "id: uc1",
        "id: scr1",
      ),
    });
    expect(issues).toMatchObject([
      {
        file: "system/usecases.yaml",
        path: ["elements", 0, "id"],
        message: "要素の ID「scr1」が重なっています。",
      },
    ]);
  });

  it("図の配置と、問いのファイルの箇所も返す", () => {
    const issues = issuesOf({
      "layouts/buc1.yaml": "bucId: buc1\nversion: -1\npositions: {}\n",
      "deliberation.yaml": (files.get("deliberation.yaml") ?? "").replace(
        "authorType: auto",
        "authorType: robot",
      ),
    });
    expect(issues.map((i) => [i.file, i.path])).toEqual([
      ["deliberation.yaml", ["questions", 0, "authorType"]],
      ["layouts/buc1.yaml", ["version"]],
    ]);
  });

  it("sujigaki.yaml がなければ読み込まない", () => {
    const withoutSettings = new Map(files);
    withoutSettings.delete("sujigaki.yaml");
    const result = readProjectFolder(withoutSettings);
    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          file: "sujigaki.yaml",
          message: expect.stringContaining("sujigaki.yaml がありません"),
        },
      ],
    });
  });

  it("ファイルの形が違えば、そのファイルを返す", () => {
    const issues = issuesOf({
      "actors.yaml": "people: []\n",
      "deliberation.yaml": "- q1\n",
      "sujigaki.yaml": `${files.get("sujigaki.yaml")}elements: []\n`,
      "requirements.yaml": "elements: [\n",
    });
    expect(issues.map((i) => [i.file, i.message])).toEqual([
      ["actors.yaml", "要素の一覧（elements）だけを書いてください。"],
      [
        "deliberation.yaml",
        "問いの一覧（questions）と決定記録の一覧（decisions）だけを書いてください。",
      ],
      ["requirements.yaml", expect.stringMatching(/^YAML として読めません/)],
      [
        "sujigaki.yaml",
        "sujigaki.yaml には、形式のバージョンとプロジェクトの設定だけを書いてください。",
      ],
    ]);
  });

  it("中身が空のファイルは、要素のないファイルとして読む", () => {
    const result = readProjectFolder(
      new Map([...files, ["system/events.yaml", ""]]),
    );
    expect(result.ok).toBe(true);
  });

  it("設定のファイルの誤りは、sujigaki.yaml の箇所として返す", () => {
    const issues = issuesOf({
      "sujigaki.yaml":
        "format: sujigaki\nversion: 1\nproject:\n  name: 申込管理\n",
    });
    expect(issues).toEqual([
      {
        file: "sujigaki.yaml",
        path: ["project", "systemName"],
        line: 4,
        message: expect.any(String),
      },
    ]);
  });
});
