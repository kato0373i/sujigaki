import type { AddressInfo } from "node:net";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import {
  createApp,
  FileProjectRepository,
  localActorResolver,
} from "@sujigaki/server";
import { staticFiles } from "./static-files.ts";

/** ローカルモードで扱う、ただ1つのプロジェクトの ID。API のパスに使う */
export const LOCAL_PROJECT_ID = "local";

const HOST = "127.0.0.1";

export interface LocalServer {
  readonly url: string;
  /** プロジェクトを新しく作ったか */
  readonly created: boolean;
  close(): Promise<void>;
}

/**
 * ローカルモードのサーバーを起動する（FR-061、ADR-003）。
 * 自分の PC の中からだけ使えるように 127.0.0.1 で待ち受け、ほかのホスト名で届いたリクエストは断る。
 * ログインがないため、ほかのサイトから DNS rebinding で呼ばれるのを防ぐためである
 */
export async function startLocalServer(options: {
  readonly folder: string;
  readonly port: number;
  /** 画面のファイルのフォルダー。既定は apps/web をビルドした dist */
  readonly webRoot?: string;
}): Promise<LocalServer> {
  const web = staticFiles(
    options.webRoot ??
      fileURLToPath(new URL("../../web/dist", import.meta.url)),
  );
  const folder = resolve(options.folder);
  const projects = new FileProjectRepository({
    folder,
    projectId: LOCAL_PROJECT_ID,
  });
  let created = false;
  if (!(await projects.load(LOCAL_PROJECT_ID))) {
    const name = basename(folder);
    const result = await projects.create(LOCAL_PROJECT_ID, {
      name,
      systemName: name,
      summaryMaxLength: 100,
    });
    if (!result.ok) throw new Error(result.error.message);
    created = true;
  }
  const app = createApp({ projects, actors: localActorResolver });

  let port = options.port;
  const server = await new Promise<ReturnType<typeof serve>>((done) => {
    const started = serve(
      {
        hostname: HOST,
        port: options.port,
        fetch: (request) => {
          if (!isAllowedHost(request.headers.get("Host"), port)) {
            return forbiddenHost();
          }
          const { pathname } = new URL(request.url);
          if (pathname.startsWith("/api/") || pathname.startsWith("/auth/")) {
            return app.fetch(request);
          }
          return web(pathname);
        },
      },
      (info: AddressInfo) => {
        port = info.port;
        done(started);
      },
    );
  });

  return {
    url: `http://${HOST}:${port}`,
    created,
    close: () =>
      new Promise((done, failed) =>
        server.close((error) => (error ? failed(error) : done())),
      ),
  };
}

export function isAllowedHost(host: string | null, port: number): boolean {
  return host === `${HOST}:${port}` || host === `localhost:${port}`;
}

function forbiddenHost(): Response {
  return new Response(
    JSON.stringify({
      type: "urn:sujigaki:problem:forbidden",
      title: "この操作の権限がありません",
      status: 403,
      code: "FORBIDDEN",
      detail:
        "ローカルモードのサーバーは 127.0.0.1 か localhost で開いてください。",
    }),
    { status: 403, headers: { "Content-Type": "application/problem+json" } },
  );
}
