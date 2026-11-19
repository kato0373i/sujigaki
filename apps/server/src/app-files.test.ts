import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { localActorResolver } from "./auth/actor-resolver.ts";
import { FileProjectRepository } from "./repository/file-project-repository.ts";

describe("ローカルモードのファイルの誤りを、API のエラーで返す", () => {
  it("形式に合わないファイルは、ファイル・行番号・理由を付けて VALIDATION_FAILED にする", async () => {
    const folder = await mkdtemp(join(tmpdir(), "sujigaki-app-"));
    try {
      const projects = new FileProjectRepository({
        folder,
        projectId: "local",
      });
      await projects.create("local", {
        name: "申込管理",
        systemName: "申込システム",
        summaryMaxLength: 100,
      });
      await writeFile(
        join(folder, "actors.yaml"),
        "elements:\n  - id: a1\n    kind: robot\n",
      );
      const app = createApp({ projects, actors: localActorResolver });
      const response = await app.request("/api/projects/local/snapshot");
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: "VALIDATION_FAILED",
        errors: [
          {
            path: ["actors.yaml", "elements", 0, "kind"],
            message: "3行目: 要素の種類が正しくありません。",
          },
        ],
      });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
