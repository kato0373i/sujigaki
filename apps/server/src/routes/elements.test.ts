import type { ElementSnapshot } from "@sujigaki/domain";
import { describe, expect, it } from "vitest";
import { PROJECT_ID, testServer } from "../testing/test-server.ts";

async function withActivity() {
  const server = await testServer();
  const created = await server.call("POST", "/elements", {
    body: {
      kind: "activity",
      name: "申込を受け付ける",
      attributes: { mode: "manual" },
    },
  });
  return {
    ...server,
    activity: created.body as { id: string; version: number },
  };
}

describe("FR-010 要素を作る", () => {
  it("未レビュー・バージョン1で作り、ETag にバージョンを返す", async () => {
    const { call } = await testServer();
    const response = await call("POST", "/elements", {
      body: { kind: "actor", name: " 審査担当 " },
    });
    expect(response.status).toBe(201);
    expect(response.etag).toBe('"1"');
    expect(response.body).toMatchObject({
      id: "id001",
      kind: "actor",
      name: "審査担当",
      reviewState: "unreviewed",
      authorType: "human",
      createdBy: "admin",
    });
  });

  it("ID を指定して作れる。同じ ID はもう作れない", async () => {
    const { call } = await testServer();
    const body = { id: "01JABC", kind: "actor", name: "審査担当" };
    expect((await call("POST", "/elements", { body })).body).toMatchObject({
      id: "01JABC",
    });
    expect((await call("POST", "/elements", { body })).status).toBe(412);
  });

  it("種類に合わない属性では作らない", async () => {
    const { call } = await testServer();
    const response = await call("POST", "/elements", {
      body: { kind: "actor", name: "審査担当", attributes: { mode: "manual" } },
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("作った要素は、スナップショットに含まれる", async () => {
    const { call, activity } = await withActivity();
    const snapshot = await call("GET", "/snapshot");
    expect(snapshot.status).toBe(200);
    expect(snapshot.body).toMatchObject({
      revision: 1,
      project: { name: "申込管理" },
      elements: [{ id: activity.id }],
    });
  });
});

describe("FR-013 FR-070 要素を編集する", () => {
  it("If-Match のバージョンが合えば編集し、バージョンが上がる", async () => {
    const { call, activity } = await withActivity();
    const response = await call("PATCH", `/elements/${activity.id}`, {
      version: 1,
      body: { name: "申込内容を確認する" },
    });
    expect(response.status).toBe(200);
    expect(response.etag).toBe('"2"');
    expect(response.body).toMatchObject({
      name: "申込内容を確認する",
      version: 2,
    });
  });

  it("バージョンが合わなければ、今の内容を付けて VERSION_CONFLICT を返す", async () => {
    const { call, activity } = await withActivity();
    await call("PATCH", `/elements/${activity.id}`, {
      version: 1,
      body: { name: "A" },
    });
    const stale = await call("PATCH", `/elements/${activity.id}`, {
      version: 1,
      body: { name: "B" },
    });
    expect(stale.status).toBe(412);
    expect(stale.body).toMatchObject({
      code: "VERSION_CONFLICT",
      detail: "要素「A」はバージョン 2 に更新されています。",
      current: { name: "A", version: 2 },
    });
  });

  it("If-Match がなければ編集しない", async () => {
    const { call, activity } = await withActivity();
    const response = await call("PATCH", `/elements/${activity.id}`, {
      body: { name: "A" },
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      detail:
        "If-Match ヘッダーに、読み込んだときのバージョンを付けてください。",
    });
  });

  it("確認済みの要素を編集すると、未レビューに戻る", async () => {
    const { call, activity } = await withActivity();
    await call("POST", `/elements/${activity.id}/review-state`, {
      version: 1,
      body: { to: "approved" },
    });
    const edited = await call("PATCH", `/elements/${activity.id}`, {
      version: 2,
      body: { attributes: { mode: "system" } },
    });
    expect(edited.body).toMatchObject({
      reviewState: "unreviewed",
      version: 3,
    });
  });

  it("外部リンクを変えても、確認状態は保つ", async () => {
    const { call, activity } = await withActivity();
    await call("POST", `/elements/${activity.id}/review-state`, {
      version: 1,
      body: { to: "approved" },
    });
    const response = await call("PATCH", `/elements/${activity.id}`, {
      version: 2,
      body: {
        links: [
          { id: "l1", kind: "manual", url: "https://example.com", label: null },
        ],
      },
    });
    expect(response.body).toMatchObject({
      reviewState: "approved",
      links: [{ id: "l1" }],
    });
  });

  it("ない要素は NOT_FOUND を返す", async () => {
    const { call } = await testServer();
    const response = await call("PATCH", "/elements/none", {
      version: 1,
      body: {},
    });
    expect(response.status).toBe(404);
  });

  it("ないプロジェクトは NOT_FOUND を返す", async () => {
    const { app } = await testServer();
    const response = await app.request("/api/projects/none/snapshot");
    expect(response.status).toBe(404);
    expect(PROJECT_ID).not.toBe("none");
  });
});

describe("FR-012 削除と復元", () => {
  it("削除すると、その要素へつながる要素も未レビューに戻る", async () => {
    const { call, activity } = await withActivity();
    const actor = (
      await call("POST", "/elements", {
        body: { kind: "actor", name: "審査担当" },
      })
    ).body as { id: string };
    await call("POST", `/elements/${activity.id}/relations`, {
      version: 1,
      body: { to: actor.id },
    });
    await call("POST", `/elements/${activity.id}/review-state`, {
      version: 2,
      body: { to: "approved" },
    });
    const deleted = await call("DELETE", `/elements/${actor.id}`, {
      version: 1,
    });
    expect(deleted.body).toMatchObject({ deletedAt: expect.any(String) });

    const snapshot = await call("GET", "/snapshot");
    const elements = (
      snapshot.body as { elements: { id: string; reviewState: string }[] }
    ).elements;
    expect(elements.map((e) => [e.id, e.reviewState])).toEqual([
      [activity.id, "unreviewed"],
    ]);

    const restored = await call("POST", `/elements/${actor.id}/restore`, {
      version: 2,
    });
    expect(restored.body).toMatchObject({ deletedAt: null, version: 3 });
  });

  it("削除済みの要素の一覧は、削除した日時の新しい順に並ぶ", async () => {
    let minutes = 0;
    const { call } = await testServer({
      now: () => new Date(Date.UTC(2026, 10, 20, 9, minutes++)),
    });
    const make = async (name: string) =>
      (
        (await call("POST", "/elements", { body: { kind: "actor", name } }))
          .body as { id: string }
      ).id;
    const first = await make("先に消す担当");
    const second = await make("あとで消す担当");
    await make("残す担当");
    await call("DELETE", `/elements/${first}`, { version: 1 });
    await call("DELETE", `/elements/${second}`, { version: 1 });

    const response = await call("GET", "/elements?deleted=true");
    expect(response.status).toBe(200);
    const elements = (response.body as { elements: ElementSnapshot[] })
      .elements;
    expect(elements.map((e) => e.name)).toEqual([
      "あとで消す担当",
      "先に消す担当",
    ]);
    expect(elements[0]).toMatchObject({ deletedBy: "admin" });
  });

  it("削除済みの一覧は、deleted=true を付けないと返さない", async () => {
    const { call } = await testServer();
    const response = await call("GET", "/elements");
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("削除済みの要素は編集できない", async () => {
    const { call, activity } = await withActivity();
    await call("DELETE", `/elements/${activity.id}`, { version: 1 });
    const response = await call("PATCH", `/elements/${activity.id}`, {
      version: 2,
      body: { name: "A" },
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "ELEMENT_DELETED" });
  });

  it("完全に削除できるのは、削除済みの要素だけ", async () => {
    const { call, activity } = await withActivity();
    const early = await call("POST", `/elements/${activity.id}/purge`, {
      version: 1,
    });
    expect(early.status).toBe(422);
    await call("DELETE", `/elements/${activity.id}`, { version: 1 });
    const purged = await call("POST", `/elements/${activity.id}/purge`, {
      version: 2,
    });
    expect(purged.status).toBe(204);
    const again = await call("POST", `/elements/${activity.id}/purge`, {
      version: 2,
    });
    expect(again.status).toBe(404);
  });

  it("完全に削除するときも、バージョンを確かめる", async () => {
    const { call, activity } = await withActivity();
    await call("DELETE", `/elements/${activity.id}`, { version: 1 });
    const stale = await call("POST", `/elements/${activity.id}/purge`, {
      version: 1,
    });
    expect(stale.status).toBe(412);
  });
});

describe("FR-001 つながり", () => {
  it("つながりを追加して削除できる。どちらも元の要素のバージョンが上がる", async () => {
    const { call, activity } = await withActivity();
    const screen = (
      await call("POST", "/elements", {
        body: { kind: "screen", name: "申込画面" },
      })
    ).body as { id: string };
    const added = await call("POST", `/elements/${activity.id}/relations`, {
      version: 1,
      body: { id: "r1", to: screen.id },
    });
    expect(added.body).toMatchObject({
      version: 2,
      relations: [{ id: "r1", typeId: "activity-screen", to: screen.id }],
    });
    const removed = await call(
      "DELETE",
      `/elements/${activity.id}/relations/r1`,
      {
        version: 2,
      },
    );
    expect(removed.body).toMatchObject({ version: 3, relations: [] });
  });

  it("定義にない組はつながず、つなげる種類を示す", async () => {
    const { call, activity } = await withActivity();
    const requirement = (
      await call("POST", "/elements", {
        body: { kind: "requirement", name: "早く審査したい" },
      })
    ).body as { id: string };
    const response = await call("POST", `/elements/${activity.id}/relations`, {
      version: 1,
      body: { to: requirement.id },
    });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: "RELATION_NOT_ALLOWED" });
  });

  it("ない要素や削除済みの要素にはつながない", async () => {
    const { call, activity } = await withActivity();
    const missing = await call("POST", `/elements/${activity.id}/relations`, {
      version: 1,
      body: { to: "none" },
    });
    expect(missing.status).toBe(404);
    const actor = (
      await call("POST", "/elements", {
        body: { kind: "actor", name: "審査担当" },
      })
    ).body as { id: string };
    await call("DELETE", `/elements/${actor.id}`, { version: 1 });
    const deleted = await call("POST", `/elements/${activity.id}/relations`, {
      version: 1,
      body: { to: actor.id },
    });
    expect(deleted.status).toBe(409);
  });
});

describe("FR-030 確認状態を変える", () => {
  it("編集者は要確認にでき、確認済みにはできない", async () => {
    const { call, activity } = await withActivity();
    const approved = await call(
      "POST",
      `/elements/${activity.id}/review-state`,
      {
        role: "editor",
        version: 1,
        body: { to: "approved" },
      },
    );
    expect(approved.status).toBe(403);
    expect(approved.body).toMatchObject({
      detail: "「確認済み」にできるのは、業務責任者以上です。",
    });
    const checked = await call(
      "POST",
      `/elements/${activity.id}/review-state`,
      {
        role: "editor",
        version: 1,
        body: { to: "needs_check" },
      },
    );
    expect(checked.body).toMatchObject({ reviewState: "needs_check" });
  });

  it("定義にない遷移は INVALID_TRANSITION を返す", async () => {
    const { call, activity } = await withActivity();
    const response = await call(
      "POST",
      `/elements/${activity.id}/review-state`,
      {
        version: 1,
        body: { to: "unreviewed" },
      },
    );
    expect(response.status).toBe(422);
  });
});

describe("操作の記録", () => {
  it("変更の一式ごとに、ドメインイベントを変更前と変更後の内容つきで残す", async () => {
    const { call, projects, activity } = await withActivity();
    await call("PATCH", `/elements/${activity.id}`, {
      version: 1,
      body: { name: "A" },
    });
    const operations = projects.operationsOf(PROJECT_ID);
    expect(operations.map((o) => [o.type, o.actorId])).toEqual([
      ["ElementCreated", "admin"],
      ["ElementEdited", "admin"],
    ]);
    expect(operations[1]).toMatchObject({
      before: { name: "申込を受け付ける" },
      after: { name: "A" },
    });
    expect(operations[0]?.batchId).not.toBe(operations[1]?.batchId);
  });
});
