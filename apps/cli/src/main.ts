#!/usr/bin/env node
import { ProjectFilesInvalidError } from "@sujigaki/server";
import { parseCliArgs, USAGE } from "./args.ts";
import { LOCAL_PROJECT_ID, startLocalServer } from "./local-server.ts";

const args = parseCliArgs(process.argv.slice(2));
if (args.type === "help") {
  console.log(USAGE);
  process.exit(0);
}
if (args.type === "error") {
  console.error(`${args.message}\n\n${USAGE}`);
  process.exit(2);
}

try {
  const server = await startLocalServer(args);
  if (server.created) {
    console.log(
      `フォルダーにプロジェクトがなかったため、新しく作りました: ${args.folder}`,
    );
  }
  console.log(`sujigaki をローカルモードで起動しました: ${server.url}`);
  console.log(`API: ${server.url}/api/projects/${LOCAL_PROJECT_ID}/snapshot`);
  console.log("終了するには Ctrl+C を押してください。");
  const stop = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  if (error instanceof ProjectFilesInvalidError) {
    console.error(
      "プロジェクトのファイルを読み込めません。次の箇所を直してから、もう一度起動してください。",
    );
    for (const issue of error.issues) {
      const where = [issue.file, issue.line]
        .filter((v) => v !== undefined && v !== null)
        .join(":");
      console.error(`  ${where} ${issue.message}`);
    }
    process.exit(1);
  }
  console.error((error as Error).message);
  process.exit(1);
}
