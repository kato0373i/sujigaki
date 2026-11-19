import {
  elementSnapshot,
  questionSnapshot,
  relationTo,
} from "@sujigaki/domain/testing";
import { writeProjectYaml } from "@sujigaki/interchange";
import { describe, expect, it } from "vitest";
import { PROJECT_ID, testServer } from "../testing/test-server.ts";

const actor = elementSnapshot("actor1", "actor", {
  name: "審査担当",
  reviewState: "approved",
});
const activity = elementSnapshot("act1", "activity", {
  name: "申込内容を確認する",
  reviewState: "approved",
  relations: [relationTo(actor, "activity")],
});
const yaml = writeProjectYaml({
  project: {
    name: "申込の管理",
    systemName: "申込システム",
    summaryMaxLength: 150,
  },
  elements: [activity, actor],
  questions: [questionSnapshot("act1")],
  decisions: [],
  layouts: [],
});

describe("FR-050 空のプロジェクトに YAML から復元する", () => {
  it("業務責任者が復元すると、確認状態と設定を含めて同じ内容になる", async () => {
    const { call } = await testServer();
    const response = await call("POST", "/restore", {
      role: "owner",
      body: { yaml },
    });
    expect(response.body).toEqual({
      revision: 1,
      elements: 2,
      questions: 1,
      decisions: 0,
      layouts: 0,
    });
    const snapshot = (await call("GET", "/snapshot")).body as {
      project: unknown;
      elements: { id: string; reviewState: string }[];
    };
    expect(snapshot.project).toEqual({
      name: "申込の管理",
      systemName: "申込システム",
      summaryMaxLength: 150,
    });
    expect(snapshot.elements.map((e) => [e.id, e.reviewState])).toEqual([
      ["act1", "approved"],
      ["actor1", "approved"],
    ]);
  });

  it("編集者が復元すると、すべての要素が未レビューになる", async () => {
    const { call } = await testServer();
    await call("POST", "/restore", { role: "editor", body: { yaml } });
    const snapshot = (await call("GET", "/snapshot")).body as {
      elements: { reviewState: string }[];
    };
    expect(snapshot.elements.map((e) => e.reviewState)).toEqual([
      "unreviewed",
      "unreviewed",
    ]);
  });

  it("要素があるプロジェクトには復元しない", async () => {
    const { call } = await testServer();
    await call("POST", "/elements", {
      body: { kind: "actor", name: "受付担当" },
    });
    const response = await call("POST", "/restore", { body: { yaml } });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "PROJECT_NOT_EMPTY" });
  });

  it("スキーマに合わない YAML は、合わない箇所を返して何も変えない", async () => {
    const { call, projects } = await testServer();
    const broken = yaml.replace("kind: actor", "kind: robot");
    const response = await call("POST", "/restore", { body: { yaml: broken } });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [
        {
          path: ["elements", 1, "kind"],
          message: expect.stringMatching(
            /^\d+行目: 要素の種類が正しくありません。$/,
          ),
        },
      ],
    });
    expect((await projects.load(PROJECT_ID))?.revision).toBe(0);
  });
});

async function restored() {
  const server = await testServer();
  const notify = elementSnapshot("act2", "activity", {
    name: "審査結果を通知する",
    reviewState: "approved",
  });
  const other = elementSnapshot("actor2", "actor", { name: "受付担当" });
  await server.call("POST", "/restore", {
    role: "owner",
    body: {
      yaml: writeProjectYaml({
        project: {
          name: "申込管理",
          systemName: "申込システム",
          summaryMaxLength: 100,
        },
        elements: [activity, notify, actor, other],
        questions: [],
        decisions: [],
        layouts: [],
      }),
    },
  });
  return server;
}

const ai = { authorType: "ai", source: "AI 提案" };
const elementOf = (
  snapshot: ReturnType<typeof elementSnapshot>,
  changes: Record<string, unknown> = {},
) => ({
  id: snapshot.id,
  kind: snapshot.kind,
  name: snapshot.name,
  relations: snapshot.relations.map((r) => ({
    id: r.id,
    typeId: r.typeId,
    to: r.to,
  })),
  ...changes,
});

describe("FR-034 FR-050 変更の一式を反映する", () => {
  it("担当者だけを変えた活動は未レビューになり、ほかの活動は確認済みのまま", async () => {
    const { call } = await restored();
    const response = await call("POST", "/change-sets", {
      body: {
        origin: { authorType: "import", source: "YAML の取り込み" },
        changes: [
          {
            type: "update",
            baseVersion: 1,
            element: elementOf(activity, {
              relations: [
                { id: "r-actor2", typeId: "activity-actor", to: "actor2" },
              ],
            }),
          },
        ],
      },
    });
    expect(response.status).toBe(200);
    const snapshot = (await call("GET", "/snapshot")).body as {
      elements: {
        id: string;
        reviewState: string;
        relations: { to: string }[];
      }[];
    };
    const byId = new Map(snapshot.elements.map((e) => [e.id, e]));
    expect(byId.get("act1")).toMatchObject({
      reviewState: "unreviewed",
      relations: [{ to: "actor2" }],
    });
    expect(byId.get("act2")?.reviewState).toBe("approved");
  });

  it("採用した AI の提案だけが、未レビューで作成者の種類を AI として追加される", async () => {
    const { call } = await restored();
    const proposal = (id: string) => ({
      type: "add",
      element: { id, kind: "activity", name: `活動${id}` },
    });
    const response = await call("POST", "/change-sets", {
      body: { origin: ai, changes: [proposal("p1"), proposal("p2")] },
    });
    expect(response.body).toMatchObject({
      elements: [
        {
          id: "p1",
          reviewState: "unreviewed",
          authorType: "ai",
          source: "AI 提案",
        },
        {
          id: "p2",
          reviewState: "unreviewed",
          authorType: "ai",
          source: "AI 提案",
        },
      ],
    });
  });

  it("差分を出したあとに更新された要素があれば、何も反映しない", async () => {
    const { call, projects } = await restored();
    await call("PATCH", "/elements/act2", {
      version: 1,
      body: { name: "通知する" },
    });
    const revision = (await projects.load(PROJECT_ID))?.revision;
    const response = await call("POST", "/change-sets", {
      body: {
        origin: ai,
        changes: [
          {
            type: "add",
            element: { id: "p1", kind: "actor", name: "新しい担当" },
          },
          {
            type: "update",
            baseVersion: 1,
            element: elementOf(activity, { name: "確認する" }),
          },
          {
            type: "update",
            baseVersion: 1,
            element: { id: "act2", kind: "activity", name: "通知" },
          },
        ],
      },
    });
    expect(response.status).toBe(412);
    expect((await projects.load(PROJECT_ID))?.revision).toBe(revision);
  });

  it("要素を削除すると、その要素へつながる要素も未レビューに戻る", async () => {
    const { call } = await restored();
    const response = await call("POST", "/change-sets", {
      body: {
        origin: ai,
        changes: [{ type: "remove", elementId: "actor1", baseVersion: 1 }],
      },
    });
    const elements = (
      response.body as {
        elements: {
          id: string;
          reviewState: string;
          deletedAt: string | null;
        }[];
      }
    ).elements;
    expect(
      elements.map((e) => [e.id, e.reviewState, e.deletedAt !== null]).sort(),
    ).toEqual([
      ["act1", "unreviewed", false],
      ["actor1", "approved", true],
    ]);
  });

  it("持てない種類のつながりや、ない要素、種類の変更は反映しない", async () => {
    const { call } = await restored();
    const send = (change: unknown) =>
      call("POST", "/change-sets", { body: { origin: ai, changes: [change] } });
    const badRelation = await send({
      type: "add",
      element: {
        id: "p1",
        kind: "actor",
        name: "担当",
        relations: [{ id: "r1", typeId: "activity-actor", to: "actor1" }],
      },
    });
    expect(badRelation.status).toBe(422);
    const missing = await send({
      type: "update",
      baseVersion: 1,
      element: { id: "none", kind: "actor", name: "担当" },
    });
    expect(missing.status).toBe(404);
    const kind = await send({
      type: "update",
      baseVersion: 1,
      element: { id: "actor1", kind: "screen", name: "担当" },
    });
    expect(kind.status).toBe(400);
    const missingRemove = await send({
      type: "remove",
      elementId: "none",
      baseVersion: 1,
    });
    expect(missingRemove.status).toBe(404);
  });

  it("1回の反映の操作の記録には、同じ変更の一式の ID を付ける", async () => {
    const { call, projects } = await restored();
    await call("POST", "/change-sets", {
      body: {
        origin: ai,
        changes: [
          { type: "add", element: { id: "p1", kind: "actor", name: "担当A" } },
          { type: "add", element: { id: "p2", kind: "actor", name: "担当B" } },
        ],
      },
    });
    const batches = new Set(
      projects
        .operationsOf(PROJECT_ID)
        .filter(
          (o) =>
            o.targetType === "element" && ["p1", "p2"].includes(o.targetId),
        )
        .map((o) => o.batchId),
    );
    expect(batches.size).toBe(1);
  });
});
