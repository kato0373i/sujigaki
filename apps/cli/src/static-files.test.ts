import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { staticFiles } from "./static-files.ts";

let root: string;
let outside: string;
beforeAll(async () => {
  outside = await mkdtemp(join(tmpdir(), "sujigaki-web-"));
  root = join(outside, "dist");
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), "<!doctype html>");
  await writeFile(join(root, "assets", "app.js"), "console.log(1)");
  await writeFile(join(outside, "secret.txt"), "secret");
});
afterAll(() => rm(outside, { recursive: true, force: true }));

describe("画面のファイルを返す", () => {
  it("ファイルを、種類に合う Content-Type で返す", async () => {
    const response = await staticFiles(root)("/assets/app.js");
    expect(response.headers.get("Content-Type")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(await response.text()).toBe("console.log(1)");
  });

  it("ルートと、見つからないパスには index.html を返す", async () => {
    for (const path of ["/", "/flows/x"]) {
      const response = await staticFiles(root)(path);
      expect(response.headers.get("Content-Type")).toBe(
        "text/html; charset=utf-8",
      );
    }
  });

  it("フォルダーの外のファイルは返さない", async () => {
    for (const path of ["/../secret.txt", "/%2e%2e/secret.txt"]) {
      const response = await staticFiles(root)(path);
      expect(await response.text()).not.toContain("secret");
    }
  });

  it("画面をビルドしていなければ、ビルドを促す", async () => {
    const response = await staticFiles(join(outside, "none"))("/");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("npm run build -w @sujigaki/web");
  });
});
