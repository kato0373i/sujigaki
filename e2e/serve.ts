import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeProjectFolder } from "@sujigaki/interchange";
import { startLocalServer } from "../apps/cli/src/local-server.ts";
import { TRAINING } from "./fixture.ts";

/** E2E のためのサーバー。毎回、例のモデルを書いた新しいフォルダーで、ローカルモードを起動する */
const folder = join(
  dirname(fileURLToPath(import.meta.url)),
  ".work",
  "training",
);
await rm(folder, { recursive: true, force: true });
for (const [path, text] of writeProjectFolder(TRAINING)) {
  await mkdir(dirname(join(folder, path)), { recursive: true });
  await writeFile(join(folder, path), text);
}
const port = Number(process.env.E2E_PORT ?? 4399);
const server = await startLocalServer({ folder, port });
console.log(`E2E のサーバーを起動しました: ${server.url}`);
