import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

/**
 * 画面のファイルを返す。root の外のファイルは返さない。
 * 見つからないパスには index.html を返し、画面の側で場所を決める
 */
export function staticFiles(root: string) {
  const base = normalize(root);
  const read = async (path: string) => {
    const file = normalize(join(base, path));
    if (file !== base && !file.startsWith(base + sep)) return null;
    try {
      return { file, body: await readFile(file) };
    } catch {
      return null;
    }
  };
  return async (pathname: string): Promise<Response> => {
    const decoded = decodeURIComponent(pathname);
    const found =
      (decoded !== "/" && (await read(decoded))) || (await read("index.html"));
    if (!found) {
      return new Response(
        "画面のファイルがありません。npm run build -w @sujigaki/web を実行してから、もう一度起動してください。",
        {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        },
      );
    }
    return new Response(found.body, {
      headers: {
        "Content-Type":
          CONTENT_TYPES[extname(found.file)] ?? "application/octet-stream",
      },
    });
  };
}
