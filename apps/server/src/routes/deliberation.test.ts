import { describe, expect, it } from "vitest";
import { PROJECT_ID, testServer } from "../testing/test-server.ts";

async function withActivity() {
  const server = await testServer();
  const activity = (
    await server.call("POST", "/elements", {
      body: { kind: "activity", name: "申込を受け付ける" },
    })
  ).body as { id: string };
  return { ...server, activity };
}

describe("FR-031 FR-035 問い", () => {
  it("要素に問いを作る。空欄から作った問いも、閲覧者が保存できる", async () => {
    const { call, activity } = await withActivity();
    const response = await call("POST", "/questions", {
      role: "viewer",
      body: {
        elementId: activity.id,
        body: "担当者は誰ですか",
        authorType: "auto",
      },
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      elementId: activity.id,
      body: "担当者は誰ですか",
      state: "open",
      authorType: "auto",
      createdBy: "viewer",
    });
    const snapshot = await call("GET", "/snapshot");
    expect(snapshot.body).toMatchObject({
      questions: [{ body: "担当者は誰ですか" }],
    });
  });

  it("ない要素や削除済みの要素には、問いを作らない", async () => {
    const { call, activity } = await withActivity();
    const missing = await call("POST", "/questions", {
      body: { elementId: "none", body: "誰ですか" },
    });
    expect(missing.status).toBe(404);
    await call("DELETE", `/elements/${activity.id}`, { version: 1 });
    const deleted = await call("POST", "/questions", {
      body: { elementId: activity.id, body: "誰ですか" },
    });
    expect(deleted.status).toBe(404);
  });

  it("同じ ID の問いは作らない", async () => {
    const { call, activity } = await withActivity();
    const body = { id: "q1", elementId: activity.id, body: "誰ですか" };
    expect((await call("POST", "/questions", { body })).status).toBe(201);
    expect((await call("POST", "/questions", { body })).status).toBe(400);
  });

  it("推奨案で回答し、回答を取り消し、もう一度回答して解決する", async () => {
    const { call, activity } = await withActivity();
    const question = (
      await call("POST", "/questions", {
        body: {
          elementId: activity.id,
          body: "担当者は誰ですか",
          recommendation: "受付担当",
        },
      })
    ).body as { id: string };
    const path = `/questions/${question.id}/state`;
    const accepted = await call("POST", path, {
      role: "viewer",
      body: { action: "acceptRecommendation" },
    });
    expect(accepted.body).toMatchObject({
      state: "answered",
      answer: "受付担当",
    });
    const retracted = await call("POST", path, {
      role: "viewer",
      body: { action: "retract" },
    });
    expect(retracted.body).toMatchObject({ state: "open", answer: null });
    await call("POST", path, {
      body: { action: "answer", answer: "審査担当" },
    });
    const resolved = await call("POST", path, {
      role: "editor",
      body: { action: "resolve" },
    });
    expect(resolved.body).toMatchObject({
      state: "resolved",
      answer: "審査担当",
    });
  });

  it("遷移できない状態からの操作は INVALID_TRANSITION を返す", async () => {
    const { call, activity } = await withActivity();
    const question = (
      await call("POST", "/questions", {
        body: { elementId: activity.id, body: "誰ですか" },
      })
    ).body as { id: string };
    const response = await call("POST", `/questions/${question.id}/state`, {
      body: { action: "resolve" },
    });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      detail: "「未回答」の問いには、解決はできません。",
    });
  });

  it("ない問いは NOT_FOUND、知らない操作は VALIDATION_FAILED を返す", async () => {
    const { call } = await withActivity();
    expect(
      (
        await call("POST", "/questions/none/state", {
          body: { action: "resolve" },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call("POST", "/questions/none/state", {
          body: { action: "close" },
        })
      ).status,
    ).toBe(400);
  });
});

describe("FR-032 決定を記録する", () => {
  it("業務責任者が、問いと要素に結び付けて記録する", async () => {
    const { call, activity, projects } = await withActivity();
    const question = (
      await call("POST", "/questions", {
        body: { elementId: activity.id, body: "誰ですか" },
      })
    ).body as { id: string };
    const response = await call("POST", "/decisions", {
      role: "owner",
      body: {
        topic: "受付の担当",
        conclusion: "審査担当が受け付ける",
        reason: "申込の内容に詳しいため",
        questionId: question.id,
        elementIds: [activity.id],
      },
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      questionId: question.id,
      elementIds: [activity.id],
      decidedBy: "owner",
    });
    const stored = await projects.load(PROJECT_ID);
    expect(stored?.document.decisions).toHaveLength(1);
    // 決定を記録しても、要素の確認状態は変えない
    expect(stored?.document.elements[0]?.reviewState).toBe("unreviewed");
  });

  it("ない要素や問いには、結び付けない", async () => {
    const { call, activity } = await withActivity();
    const base = { topic: "担当", conclusion: "受付", reason: "近い" };
    const noElement = await call("POST", "/decisions", {
      body: { ...base, elementIds: ["none"] },
    });
    expect(noElement.body).toMatchObject({
      code: "NOT_FOUND",
      detail: "決定に関係する要素「none」が見つかりません。",
    });
    const noQuestion = await call("POST", "/decisions", {
      body: { ...base, elementIds: [activity.id], questionId: "none" },
    });
    expect(noQuestion.status).toBe(404);
  });

  it("理由がなければ記録しない", async () => {
    const { call, activity } = await withActivity();
    const response = await call("POST", "/decisions", {
      body: {
        topic: "担当",
        conclusion: "受付",
        reason: " ",
        elementIds: [activity.id],
      },
    });
    expect(response.status).toBe(400);
  });
});
