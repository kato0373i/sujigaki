import { describe, expect, it } from "vitest";
import { PROJECT_ID, testServer } from "../testing/test-server.ts";

async function withBuc() {
  const server = await testServer();
  const make = async (kind: string, name: string) =>
    (
      (await server.call("POST", "/elements", { body: { kind, name } }))
        .body as { id: string }
    ).id;
  return {
    ...server,
    buc: await make("buc", "申込を受け付ける"),
    activity: await make("activity", "確認する"),
  };
}

describe("FR-020 図の配置を保存する", () => {
  it("まだ保存していない配置は、バージョン0として保存する", async () => {
    const { call, buc, activity } = await withBuc();
    const response = await call("PUT", `/layouts/${buc}`, {
      version: 0,
      body: { positions: { [activity]: { x: 10, y: 20 } } },
    });
    expect(response.status).toBe(200);
    expect(response.etag).toBe('"1"');
    expect(response.body).toMatchObject({
      bucId: buc,
      version: 1,
      positions: { [activity]: { x: 10, y: 20 } },
    });
  });

  it("位置を動かしても、要素のバージョンと確認状態は変わらない", async () => {
    const { call, buc, activity, projects } = await withBuc();
    await call("PUT", `/layouts/${buc}`, {
      version: 0,
      body: { positions: { [activity]: { x: 10, y: 20 } } },
    });
    const element = (await projects.load(PROJECT_ID))?.document.elements.find(
      (e) => e.id === activity,
    );
    expect(element).toMatchObject({ version: 1, reviewState: "unreviewed" });
  });

  it("バージョンが合わなければ、今の配置を付けて VERSION_CONFLICT を返す", async () => {
    const { call, buc, activity } = await withBuc();
    const body = { positions: { [activity]: { x: 10, y: 20 } } };
    await call("PUT", `/layouts/${buc}`, { version: 0, body });
    const stale = await call("PUT", `/layouts/${buc}`, {
      version: 0,
      body: { positions: { [activity]: { x: 99, y: 0 } } },
    });
    expect(stale.status).toBe(412);
    expect(stale.body).toMatchObject({
      current: { version: 1, positions: body.positions },
    });
  });

  it("位置が変わらなければ、保存せずに今の配置を返す", async () => {
    const { call, buc, activity, projects } = await withBuc();
    const body = { positions: { [activity]: { x: 10, y: 20 } } };
    await call("PUT", `/layouts/${buc}`, { version: 0, body });
    const revision = (await projects.load(PROJECT_ID))?.revision;
    const again = await call("PUT", `/layouts/${buc}`, { version: 1, body });
    expect(again.body).toMatchObject({ version: 1 });
    expect((await projects.load(PROJECT_ID))?.revision).toBe(revision);
  });

  it("業務フローでない要素には、図の配置を保存しない", async () => {
    const { call, activity } = await withBuc();
    const response = await call("PUT", `/layouts/${activity}`, {
      version: 0,
      body: { positions: {} },
    });
    expect(response.status).toBe(404);
  });
});

describe("FR-005 プロジェクトの設定を変える", () => {
  it("要約の上限を変え、スナップショットにも反映される", async () => {
    const { call } = await testServer();
    const response = await call("PATCH", "", {
      body: { summaryMaxLength: 200 },
    });
    expect(response.body).toEqual({
      name: "申込管理",
      systemName: "申込システム",
      summaryMaxLength: 200,
    });
    expect((await call("GET", "/snapshot")).body).toMatchObject({
      project: { summaryMaxLength: 200 },
    });
  });

  it("要約の上限は1以上の整数にする", async () => {
    const { call } = await testServer();
    const response = await call("PATCH", "", { body: { summaryMaxLength: 0 } });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      detail: "要約の上限は1以上の整数にしてください。",
    });
  });

  it("何も変わらなければ、保存しない", async () => {
    const { call, projects } = await testServer();
    await call("PATCH", "", { body: { name: "申込管理" } });
    expect((await projects.load(PROJECT_ID))?.revision).toBe(0);
  });
});
