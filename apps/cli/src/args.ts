import { parseArgs } from "node:util";

export const DEFAULT_PORT = 4300;

export const USAGE = `使い方: sujigaki <フォルダー> [--port <番号>]

フォルダーの YAML ファイルを読み書きする、ローカルモードのサーバーを起動します。
フォルダーにプロジェクトがなければ、フォルダーの名前で作ります。

  --port, -p  待ち受けるポートの番号（既定は ${DEFAULT_PORT}）
  --help, -h  この説明を表示する`;

export type CliArgs =
  | { readonly type: "start"; readonly folder: string; readonly port: number }
  | { readonly type: "help" }
  | { readonly type: "error"; readonly message: string };

/** コマンドの引数を読む */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    return { type: "error", message: (error as Error).message };
  }
  if (parsed.values.help) return { type: "help" };
  const [folder, ...extra] = parsed.positionals;
  if (!folder)
    return { type: "error", message: "フォルダーを指定してください。" };
  if (extra.length > 0) {
    return { type: "error", message: "フォルダーは1つだけ指定してください。" };
  }
  const port =
    parsed.values.port === undefined
      ? DEFAULT_PORT
      : Number(parsed.values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return {
      type: "error",
      message: "ポートには0から65535までの整数を指定してください。",
    };
  }
  return { type: "start", folder, port };
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      port: { type: "string", short: "p" },
      help: { type: "boolean", short: "h" },
    },
  });
}
