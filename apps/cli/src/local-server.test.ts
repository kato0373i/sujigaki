import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectFilesInvalidError } from "@sujigaki/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  isAllowedHost,
  LOCAL_PROJECT_ID,
  type LocalServer,
  startLocalServer,
} from "./local-server.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function started(folder?: string) {
  const dir =
    folder ?? join(await mkdtemp(join(tmpdir(), "sujigaki-cli-")), "申込管理");
  const server = await startLocalServer({ folder: dir, port: 0 });
  cleanups.push(() => server.close());
  cleanups.push(() => rm(join(dir, ".."), { recursive: true, force: true }));
  return { folder: dir, server, api: api(server) };
}

function api(server: LocalServer) {
  return async (
    method: string,
    path: string,
    body?: unknown,
    version?: number,
  ) => {
    const headers: Record<string, string> = { "X-Sujigaki-Request": "1" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (version !== undefined) headers["If-Match"] = `"${version}"`;
    const response = await fetch(
      `${server.url}/api/projects/${LOCAL_PROJECT_ID}${path}`,
      {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
      },
    );
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  };
}

describe("FR-061 ローカルモードで動作する", () => {
  it("空のフォルダーなら、フォルダーの名前でプロジェクトを作る", async () => {
    const { server, api: call } = await started();
    expect(server.created).toBe(true);
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const snapshot = await call("GET", "/snapshot");
    expect(snapshot.body).toMatchObject({
      project: { name: "申込管理", systemName: "申込管理" },
    });
  });

  it("活動を1つ編集して保存すると、その活動を含むファイルだけが変わる", async () => {
    const { folder, api: call } = await started();
    const make = async (kind: string, name: string) =>
      (await call("POST", "/elements", { kind, name })).body as { id: string };
    const connect = (from: string, to: string, version: number) =>
      call("POST", `/elements/${from}/relations`, { to }, version);
    const [biz1, buc1, act1, biz2, buc2, act2] = [
      await make("business", "申込受付"),
      await make("buc", "申込を受け付ける"),
      await make("activity", "申込内容を確認する"),
      await make("business", "審査"),
      await make("buc", "審査する"),
      await make("activity", "審査結果を通知する"),
    ];
    await connect(biz1.id, buc1.id, 1);
    await connect(buc1.id, act1.id, 1);
    await connect(biz2.id, buc2.id, 1);
    await connect(buc2.id, act2.id, 1);

    const read = (id: string) =>
      readFile(join(folder, "businesses", `${id}.yaml`), "utf8");
    const before = { first: await read(biz1.id), second: await read(biz2.id) };
    const edited = await call(
      "PATCH",
      `/elements/${act1.id}`,
      { name: "申込内容を確かめる" },
      1,
    );
    expect(edited.status).toBe(200);
    expect(await read(biz1.id)).not.toBe(before.first);
    expect(await read(biz1.id)).toContain("申込内容を確かめる");
    expect(await read(biz2.id)).toBe(before.second);
  });

  it("ツールの外でファイルが変わったら、保存せずに読み込み直しを促す", async () => {
    const { folder, api: call } = await started();
    const actor = (
      await call("POST", "/elements", { kind: "actor", name: "審査担当" })
    ).body as {
      id: string;
    };
    const path = join(folder, "actors.yaml");
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace("審査担当", "審査の担当"),
    );
    const response = await call(
      "PATCH",
      `/elements/${actor.id}`,
      { name: "受付担当" },
      1,
    );
    expect(response.status).toBe(412);
    expect(response.body).toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it.skipIf(process.getuid?.() === 0)(
    "フォルダーに書き込めなければ、保存できなかったことを返す",
    async () => {
      const { folder, api: call } = await started();
      await chmod(folder, 0o555);
      cleanups.push(() => chmod(folder, 0o755));
      const response = await call("POST", "/elements", {
        kind: "actor",
        name: "審査担当",
      });
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        code: "INTERNAL",
        detail: expect.stringContaining(
          "フォルダーに書き込めなかったため、保存できませんでした",
        ),
      });
    },
  );

  it("形式に合わないファイルがあれば、起動しない", async () => {
    const root = await mkdtemp(join(tmpdir(), "sujigaki-cli-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    await writeFile(
      join(root, "sujigaki.yaml"),
      "format: sujigaki\nversion: 1\nproject:\n  name: 申込管理\n",
    );
    const error = await startLocalServer({ folder: root, port: 0 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ProjectFilesInvalidError);
  });
});

describe("ほかのサイトからの呼び出しを防ぐ", () => {
  it("127.0.0.1 と localhost のホスト名だけを受け付ける", () => {
    expect(isAllowedHost("127.0.0.1:4300", 4300)).toBe(true);
    expect(isAllowedHost("localhost:4300", 4300)).toBe(true);
    expect(isAllowedHost("evil.example:4300", 4300)).toBe(false);
    expect(isAllowedHost("127.0.0.1:4301", 4300)).toBe(false);
    expect(isAllowedHost(null, 4300)).toBe(false);
  });

  it("ほかのホスト名で届いたリクエストは断る", async () => {
    const { server } = await started();
    const status = await new Promise<number | undefined>((done, failed) => {
      const req = request(
        `${server.url}/api/projects/${LOCAL_PROJECT_ID}/snapshot`,
        { headers: { Host: "evil.example" } },
        (res) => {
          res.resume();
          done(res.statusCode);
        },
      );
      req.on("error", failed);
      req.end();
    });
    expect(status).toBe(403);
  });
});
