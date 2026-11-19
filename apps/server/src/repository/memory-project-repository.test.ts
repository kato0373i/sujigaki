import { AT } from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { MemoryProjectRepository } from "./memory-project-repository.ts";
import { projectRepositoryContract } from "./project-repository.contract.ts";

describe("メモリのリポジトリ", () => {
  projectRepositoryContract(async () => ({
    repository: new MemoryProjectRepository(),
    projectId: "p1",
  }));

  it("操作の記録に、変更の一式の ID を付けて残す", async () => {
    const repository = new MemoryProjectRepository();
    await repository.create("p1", {
      name: "a",
      systemName: "b",
      summaryMaxLength: 100,
    });
    await repository.commit("p1", {
      batchId: "batch-1",
      operations: [
        {
          type: "ElementCreated",
          targetType: "element",
          targetId: "a1",
          actorId: "editor",
          occurredAt: AT.toISOString(),
          before: null,
          after: { name: "申込" },
        },
      ],
    });
    expect(repository.operationsOf("p1")).toMatchObject([
      { batchId: "batch-1", type: "ElementCreated", targetId: "a1" },
    ]);
    expect(repository.operationsOf("none")).toEqual([]);
  });
});
