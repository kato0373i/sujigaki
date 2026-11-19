import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileProjectRepository,
  ProjectFilesInvalidError,
} from "./file-project-repository.ts";
import { projectRepositoryContract } from "./project-repository.contract.ts";

const folders: string[] = [];
async function newFolder() {
  const folder = await mkdtemp(join(tmpdir(), "sujigaki-"));
  folders.push(folder);
  return folder;
}
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((f) => rm(f, { recursive: true, force: true })),
  );
});

const settings = {
  name: "申込管理",
  systemName: "申込システム",
  summaryMaxLength: 100,
};

async function createdRepository() {
  const folder = await newFolder();
  const repository = new FileProjectRepository({ folder, projectId: "local" });
  await repository.create("local", settings);
  return { folder, repository };
}

describe("ローカルモードのファイルのリポジトリ", () => {
  projectRepositoryContract(async () => ({
    repository: new FileProjectRepository({
      folder: await newFolder(),
      projectId: "local",
    }),
    projectId: "local",
  }));

  it("FR-061 設計書 5.4 節の構成でファイルを書き、空になったファイルは消す", async () => {
    const { folder, repository } = await createdRepository();
    const act = elementSnapshot("act1", "activity");
    const business = elementSnapshot("biz1", "business", {
      relations: [relationTo(elementSnapshot("buc1", "buc"), "business")],
    });
    const buc = elementSnapshot("buc1", "buc", {
      relations: [relationTo(act, "buc")],
    });
    await repository.commit("local", {
      batchId: "b1",
      elements: [act, business, buc].map((value) => ({
        value,
        expectedVersion: null,
      })),
      operations: [],
    });
    expect((await readdir(folder, { recursive: true })).sort()).toEqual([
      "businesses",
      "businesses/biz1.yaml",
      "sujigaki.yaml",
    ]);

    await repository.load("local");
    await repository.commit("local", {
      batchId: "b2",
      purgedElements: [act, business, buc].map((e) => ({
        id: e.id,
        expectedVersion: 1,
      })),
      operations: [],
    });
    expect(await readdir(join(folder, "businesses"))).toEqual([]);
  });

  it("ファイルが外で変わったら、読み込み直すまで保存しない", async () => {
    const { folder, repository } = await createdRepository();
    await repository.load("local");
    const path = join(folder, "sujigaki.yaml");
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace("申込管理", "申込の管理"),
    );

    const commit = () =>
      repository.commit("local", {
        batchId: "b1",
        elements: [
          { value: elementSnapshot("a1", "actor"), expectedVersion: null },
        ],
        operations: [],
      });
    expect(await commit()).toMatchObject({
      ok: false,
      error: {
        code: "VERSION_CONFLICT",
        message:
          "フォルダーのファイルが、ほかのエディターや git pull で変わっています。読み込み直してから保存してください。",
      },
    });
    const reloaded = await repository.load("local");
    expect(reloaded?.document.project.name).toBe("申込の管理");
    expect((await commit()).ok).toBe(true);
  });

  it("形式に合わないファイルがあれば、ファイルと行番号を付けて知らせる", async () => {
    const { folder, repository } = await createdRepository();
    await writeFile(
      join(folder, "actors.yaml"),
      "elements:\n  - id: a1\n    kind: robot\n",
    );
    const error = await repository.load("local").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProjectFilesInvalidError);
    expect((error as ProjectFilesInvalidError).issues).toMatchObject([
      {
        file: "actors.yaml",
        line: 3,
        message: "要素の種類が正しくありません。",
      },
    ]);
  });

  it("sujigaki のファイルでないものには触らない", async () => {
    const { folder, repository } = await createdRepository();
    await writeFile(join(folder, "README.md"), "# メモ\n");
    await repository.load("local");
    await repository.commit("local", {
      batchId: "b1",
      elements: [
        { value: elementSnapshot("a1", "actor"), expectedVersion: null },
      ],
      operations: [],
    });
    expect(await readFile(join(folder, "README.md"), "utf8")).toBe("# メモ\n");
  });

  it("フォルダーがまだなければ、作るときにフォルダーごと作る", async () => {
    const folder = join(await newFolder(), "new");
    const repository = new FileProjectRepository({
      folder,
      projectId: "local",
    });
    expect(await repository.load("local")).toBeNull();
    expect((await repository.create("local", settings)).ok).toBe(true);
    expect(await readdir(folder)).toEqual(["sujigaki.yaml"]);
  });

  it("扱うプロジェクトは1つだけ", async () => {
    const repository = new FileProjectRepository({
      folder: await newFolder(),
      projectId: "local",
    });
    expect(await repository.create("other", settings)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
