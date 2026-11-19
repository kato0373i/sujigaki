import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { elementId } from "@sujigaki/domain";
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

  it("ファイルが外で変わったら、変わった要素のバージョンとリビジョンを進める", async () => {
    const { folder, repository } = await createdRepository();
    const actor = elementSnapshot("a1", "actor", { name: "審査担当" });
    await repository.commit("local", {
      batchId: "b1",
      elements: [{ value: actor, expectedVersion: null }],
      operations: [],
    });
    const before = await repository.load("local");
    const path = join(folder, "actors.yaml");
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace("審査担当", "審査の担当"),
    );

    // 外で変わる前のバージョンのまま保存しようとすると、競合にする
    const stale = await repository.commit("local", {
      batchId: "b2",
      elements: [
        {
          value: { ...actor, name: "受付担当", version: 2 },
          expectedVersion: 1,
        },
      ],
      operations: [],
    });
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "VERSION_CONFLICT" },
    });

    const after = await repository.load("local");
    expect(after?.revision).toBe((before?.revision ?? 0) + 1);
    expect(after?.document.elements[0]).toMatchObject({
      name: "審査の担当",
      version: 2,
    });

    // 読み込み直したバージョンなら保存でき、進めたバージョンもファイルに書く
    const saved = await repository.commit("local", {
      batchId: "b3",
      elements: [
        {
          value: { ...actor, name: "受付担当", version: 3 },
          expectedVersion: 2,
        },
      ],
      operations: [],
    });
    expect(saved.ok).toBe(true);
    expect(await readFile(path, "utf8")).toContain("version: 3");
  });

  it("外で変わらなかった要素は、バージョンを進めずにそのまま保存できる", async () => {
    const { folder, repository } = await createdRepository();
    const actor = elementSnapshot("a1", "actor");
    await repository.commit("local", {
      batchId: "b1",
      elements: [{ value: actor, expectedVersion: null }],
      operations: [],
    });
    const path = join(folder, "sujigaki.yaml");
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace("申込管理", "申込の管理"),
    );
    const saved = await repository.commit("local", {
      batchId: "b2",
      elements: [
        {
          value: { ...actor, name: "受付担当", version: 2 },
          expectedVersion: 1,
        },
      ],
      operations: [],
    });
    expect(saved.ok).toBe(true);
    expect((await repository.load("local"))?.document.project.name).toBe(
      "申込の管理",
    );
  });

  it("図の配置が外で変わったときも、バージョンを進める", async () => {
    const { folder, repository } = await createdRepository();
    const layout = {
      bucId: elementId("buc1"),
      version: 1,
      updatedAt: null,
      positions: { [elementId("a1")]: { x: 1, y: 2 } },
    };
    await repository.commit("local", {
      batchId: "b1",
      layouts: [{ value: layout, expectedVersion: 0 }],
      operations: [],
    });
    const path = join(folder, "layouts", "buc1.yaml");
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace("x: 1", "x: 5"),
    );
    expect((await repository.load("local"))?.document.layouts[0]?.version).toBe(
      2,
    );
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
