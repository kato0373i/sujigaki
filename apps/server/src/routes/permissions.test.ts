import { can, PERMISSIONS, type Permission, ROLES } from "@sujigaki/domain";
import { describe, expect, it } from "vitest";
import { PROJECT_ID, testServer } from "../testing/test-server.ts";

interface Fixture {
  readonly activity: string;
  readonly actor: string;
  readonly deleted: string;
}

interface Endpoint {
  readonly method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Hono に登録したパス。すべてのルートが表にあることを確かめるのに使う */
  readonly route: string;
  readonly path: (f: Fixture) => string;
  readonly permission: Permission;
  readonly body?: (f: Fixture) => unknown;
  readonly version?: (f: Fixture) => { id: string; version: number };
}

const base = "/api/projects/:projectId";

/** エンドポイントと、必要な権限の対応（FR-081 の表） */
const ENDPOINTS: readonly Endpoint[] = [
  {
    method: "GET",
    route: `${base}/snapshot`,
    path: () => "/snapshot",
    permission: "view",
  },
  {
    method: "POST",
    route: `${base}/elements`,
    path: () => "/elements",
    permission: "editElement",
    body: () => ({ kind: "actor", name: "受付担当" }),
  },
  {
    method: "PATCH",
    route: `${base}/elements/:elementId`,
    path: (f) => `/elements/${f.activity}`,
    permission: "editElement",
    body: () => ({ name: "名前を変える" }),
    version: (f) => ({ id: f.activity, version: 1 }),
  },
  {
    method: "DELETE",
    route: `${base}/elements/:elementId`,
    path: (f) => `/elements/${f.activity}`,
    permission: "editElement",
    version: (f) => ({ id: f.activity, version: 1 }),
  },
  {
    method: "POST",
    route: `${base}/elements/:elementId/restore`,
    path: (f) => `/elements/${f.deleted}/restore`,
    permission: "editElement",
    version: (f) => ({ id: f.deleted, version: 2 }),
  },
  {
    method: "POST",
    route: `${base}/elements/:elementId/relations`,
    path: (f) => `/elements/${f.activity}/relations`,
    permission: "editElement",
    body: (f) => ({ to: f.actor }),
    version: (f) => ({ id: f.activity, version: 1 }),
  },
  {
    method: "DELETE",
    route: `${base}/elements/:elementId/relations/:relationId`,
    path: (f) => `/elements/${f.activity}/relations/none`,
    permission: "editElement",
    version: (f) => ({ id: f.activity, version: 1 }),
  },
  {
    method: "POST",
    route: `${base}/elements/:elementId/review-state`,
    path: (f) => `/elements/${f.activity}/review-state`,
    permission: "flagReview",
    body: () => ({ to: "needs_check" }),
    version: (f) => ({ id: f.activity, version: 1 }),
  },
  {
    method: "POST",
    route: `${base}/elements/:elementId/review-state`,
    path: (f) => `/elements/${f.activity}/review-state`,
    permission: "approveReview",
    body: () => ({ to: "approved" }),
    version: (f) => ({ id: f.activity, version: 1 }),
  },
  {
    method: "POST",
    route: `${base}/elements/:elementId/purge`,
    path: (f) => `/elements/${f.deleted}/purge`,
    permission: "purgeElement",
    version: (f) => ({ id: f.deleted, version: 2 }),
  },
];

async function prepared() {
  const server = await testServer();
  const make = async (kind: string, name: string) =>
    (
      (await server.call("POST", "/elements", { body: { kind, name } }))
        .body as { id: string }
    ).id;
  const fixture: Fixture = {
    activity: await make("activity", "申込を受け付ける"),
    actor: await make("actor", "審査担当"),
    deleted: await make("actor", "削除した担当"),
  };
  await server.call("DELETE", `/elements/${fixture.deleted}`, { version: 1 });
  return { ...server, fixture };
}

describe("NFR-006 権限の外の操作を、API を直接呼んでも通さない", () => {
  const cases = ENDPOINTS.flatMap((endpoint) =>
    ROLES.map((role) => ({
      endpoint,
      role,
      allowed: can({ userId: role, role }, endpoint.permission),
    })),
  );

  it.each(cases)(
    "$endpoint.method $endpoint.route（$endpoint.permission）を $role が呼ぶ",
    async ({ endpoint, role, allowed }) => {
      const { call, projects, fixture } = await prepared();
      const before = await projects.load(PROJECT_ID);
      const response = await call(endpoint.method, endpoint.path(fixture), {
        role,
        ...(endpoint.body && { body: endpoint.body(fixture) }),
        ...(endpoint.version && { version: endpoint.version(fixture).version }),
      });
      if (allowed) {
        // 権限があれば、拒否されない（つながりの削除は、ないつながりなので 404 になる）
        expect(response.status).not.toBe(403);
        expect(response.status).toBeLessThan(500);
      } else {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ code: "FORBIDDEN" });
        expect(await projects.load(PROJECT_ID)).toEqual(before);
      }
    },
  );

  it("登録したすべての API が、上の表にある", async () => {
    const { app } = await testServer();
    const registered = app.routes
      .filter((r) => r.path.startsWith("/api/") && r.method !== "ALL")
      .map((r) => `${r.method} ${r.path}`);
    const listed = new Set(ENDPOINTS.map((e) => `${e.method} ${e.route}`));
    expect(registered.filter((r) => !listed.has(r))).toEqual([]);
  });

  it("表で使う権限は、権限の表にある", () => {
    for (const endpoint of ENDPOINTS) {
      expect(Object.keys(PERMISSIONS)).toContain(endpoint.permission);
    }
  });
});
