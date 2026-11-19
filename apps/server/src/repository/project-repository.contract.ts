import { decisionId, elementId, questionId } from "@sujigaki/domain";
import {
  AT,
  elementSnapshot,
  questionSnapshot,
} from "@sujigaki/domain/testing";
import { expect, it } from "vitest";
import type {
  ChangeSet,
  OperationRecord,
  ProjectRepository,
} from "./project-repository.ts";

/**
 * どのリポジトリの実装にも通すテスト（テスト戦略 4.1 節）。
 * メモリの実装が本物とずれないように、同じテストをファイルと PostgreSQL の実装にも通す
 */
export function projectRepositoryContract(
  setup: () => Promise<{ repository: ProjectRepository; projectId: string }>,
) {
  const settings = {
    name: "申込管理",
    systemName: "申込システム",
    summaryMaxLength: 100,
  };
  const operation = (targetId: string): OperationRecord => ({
    type: "ElementCreated",
    targetType: "element",
    targetId,
    actorId: "editor",
    occurredAt: AT.toISOString(),
    before: null,
    after: null,
  });
  const created = async () => {
    const context = await setup();
    const result = await context.repository.create(context.projectId, settings);
    if (!result.ok) throw new Error(result.error.message);
    return context;
  };
  const changes = (
    partial: Omit<ChangeSet, "batchId" | "operations"> & {
      operations?: readonly OperationRecord[];
    },
  ): ChangeSet => ({ batchId: "b1", operations: [], ...partial });

  it("空のプロジェクトを作り、読み込める", async () => {
    const { repository, projectId } = await created();
    expect(await repository.load(projectId)).toEqual({
      document: {
        project: settings,
        elements: [],
        questions: [],
        decisions: [],
        layouts: [],
      },
      revision: 0,
    });
  });

  it("ないプロジェクトは null を返し、保存もできない", async () => {
    const { repository, projectId } = await setup();
    expect(await repository.load(projectId)).toBeNull();
    expect(await repository.load("other")).toBeNull();
    const result = await repository.commit(projectId, changes({}));
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("同じ ID のプロジェクトは作れない", async () => {
    const { repository, projectId } = await created();
    expect((await repository.create(projectId, settings)).ok).toBe(false);
  });

  it("保存すると、操作の数だけリビジョンが進み、読み込むと保存した内容になる", async () => {
    const { repository, projectId } = await created();
    const a1 = elementSnapshot("a1", "activity", { name: "申込を受け付ける" });
    const a2 = elementSnapshot("a2", "actor");
    const result = await repository.commit(
      projectId,
      changes({
        elements: [
          { value: a1, expectedVersion: null },
          { value: a2, expectedVersion: null },
        ],
        questions: [questionSnapshot("a1")],
        operations: [operation("a1"), operation("a2")],
      }),
    );
    expect(result).toEqual({ ok: true, value: { revision: 2 } });
    const stored = await repository.load(projectId);
    expect(stored?.revision).toBe(2);
    expect(stored?.document.elements).toEqual([a1, a2]);
    expect(stored?.document.questions).toEqual([questionSnapshot("a1")]);
  });

  it("バージョンが合えば要素を更新し、合わなければ何も保存しない", async () => {
    const { repository, projectId } = await created();
    const a1 = elementSnapshot("a1", "activity");
    await repository.commit(
      projectId,
      changes({ elements: [{ value: a1, expectedVersion: null }] }),
    );
    const updated = { ...a1, name: "名前を変えた", version: 2 };
    const ok = await repository.commit(
      projectId,
      changes({ elements: [{ value: updated, expectedVersion: 1 }] }),
    );
    expect(ok.ok).toBe(true);

    const a2 = elementSnapshot("a2", "actor");
    const stale = await repository.commit(
      projectId,
      changes({
        elements: [
          { value: a2, expectedVersion: null },
          {
            value: { ...a1, name: "古い内容", version: 2 },
            expectedVersion: 1,
          },
        ],
      }),
    );
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "VERSION_CONFLICT" },
    });
    const stored = await repository.load(projectId);
    expect(stored?.document.elements).toEqual([updated]);
  });

  it("同じ ID の要素を新しく作ろうとすると、競合にする", async () => {
    const { repository, projectId } = await created();
    const a1 = elementSnapshot("a1", "activity");
    await repository.commit(
      projectId,
      changes({ elements: [{ value: a1, expectedVersion: null }] }),
    );
    const again = await repository.commit(
      projectId,
      changes({ elements: [{ value: a1, expectedVersion: null }] }),
    );
    expect(again).toMatchObject({
      ok: false,
      error: { code: "VERSION_CONFLICT" },
    });
  });

  it("NFR-005 同じバージョンへの同時の更新は、1件だけが成功する", async () => {
    const { repository, projectId } = await created();
    const a1 = elementSnapshot("a1", "activity");
    await repository.commit(
      projectId,
      changes({ elements: [{ value: a1, expectedVersion: null }] }),
    );
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        repository.commit(
          projectId,
          changes({
            elements: [
              {
                value: { ...a1, name: `更新${i}`, version: 2 },
                expectedVersion: 1,
              },
            ],
          }),
        ),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(
      results.filter((r) => !r.ok && r.error.code === "VERSION_CONFLICT"),
    ).toHaveLength(9);
    const winner = results.findIndex((r) => r.ok);
    const stored = await repository.load(projectId);
    expect(stored?.document.elements[0]?.name).toBe(`更新${winner}`);
  });

  it("要素を完全に削除できる。バージョンが合わなければ削除しない", async () => {
    const { repository, projectId } = await created();
    const a1 = elementSnapshot("a1", "activity");
    await repository.commit(
      projectId,
      changes({ elements: [{ value: a1, expectedVersion: null }] }),
    );
    const stale = await repository.commit(
      projectId,
      changes({ purgedElements: [{ id: a1.id, expectedVersion: 5 }] }),
    );
    expect(stale.ok).toBe(false);
    const missing = await repository.commit(
      projectId,
      changes({
        purgedElements: [{ id: elementId("none"), expectedVersion: 1 }],
      }),
    );
    expect(missing.ok).toBe(false);
    await repository.commit(
      projectId,
      changes({ purgedElements: [{ id: a1.id, expectedVersion: 1 }] }),
    );
    expect((await repository.load(projectId))?.document.elements).toEqual([]);
  });

  it("図の配置は、まだ保存していなければバージョン0として扱う", async () => {
    const { repository, projectId } = await created();
    const layout = {
      bucId: elementId("buc1"),
      version: 1,
      updatedAt: AT.toISOString(),
      positions: { [elementId("a1")]: { x: 1, y: 2 } },
    };
    const first = await repository.commit(
      projectId,
      changes({ layouts: [{ value: layout, expectedVersion: 0 }] }),
    );
    expect(first.ok).toBe(true);
    const stale = await repository.commit(
      projectId,
      changes({
        layouts: [{ value: { ...layout, version: 2 }, expectedVersion: 0 }],
      }),
    );
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "VERSION_CONFLICT" },
    });
    expect((await repository.load(projectId))?.document.layouts).toEqual([
      layout,
    ]);
  });

  it("問いは上書きし、決定記録は新しく作るだけにする", async () => {
    const { repository, projectId } = await created();
    const question = questionSnapshot("a1", { id: questionId("q1") });
    await repository.commit(projectId, changes({ questions: [question] }));
    const answered = {
      ...question,
      state: "answered" as const,
      answer: "受付担当",
    };
    await repository.commit(projectId, changes({ questions: [answered] }));
    expect((await repository.load(projectId))?.document.questions).toEqual([
      answered,
    ]);

    const decision = {
      id: decisionId("d1"),
      topic: "担当",
      conclusion: "受付担当",
      reason: "窓口と同じ人がよい",
      questionId: null,
      elementIds: [elementId("a1")],
      decidedBy: "owner",
      decidedAt: AT.toISOString(),
    };
    expect(
      (await repository.commit(projectId, changes({ decisions: [decision] })))
        .ok,
    ).toBe(true);
    const again = await repository.commit(
      projectId,
      changes({ decisions: [decision] }),
    );
    expect(again).toMatchObject({
      ok: false,
      error: { code: "VERSION_CONFLICT" },
    });
  });

  it("プロジェクトの設定を保存できる", async () => {
    const { repository, projectId } = await created();
    const next = { ...settings, summaryMaxLength: 200 };
    await repository.commit(projectId, changes({ project: next }));
    expect((await repository.load(projectId))?.document.project).toEqual(next);
  });
}
