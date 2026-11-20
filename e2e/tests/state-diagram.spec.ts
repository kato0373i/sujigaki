import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";
const api = "/api/projects/local/elements";
const write = { "X-Sujigaki-Request": "1" };

interface Created {
  id: string;
  version: number;
}

async function create(
  request: APIRequestContext,
  kind: string,
  name: string,
): Promise<Created> {
  const response = await request.post(api, {
    headers: write,
    data: { kind, name },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

/** from から to へつなぎ、つないだあとの from を返す */
async function connect(
  request: APIRequestContext,
  from: Created,
  to: Created,
): Promise<Created> {
  const response = await request.post(`${api}/${from.id}/relations`, {
    headers: { ...write, "If-Match": `"${from.version}"` },
    data: { to: to.id },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

/** 後の E2E が数える要素を変えないよう、作った要素は完全に削除して片付ける */
async function purge(request: APIRequestContext, ids: readonly string[]) {
  const snapshot = await (
    await request.get("/api/projects/local/snapshot")
  ).json();
  for (const id of ids) {
    const element = snapshot.elements.find((e: Created) => e.id === id);
    const deleted = await request.delete(`${api}/${id}`, {
      headers: { ...write, "If-Match": `"${element.version}"` },
    });
    expect(deleted.ok()).toBe(true);
  }
  // 完全に削除すると、つながっていたほかの要素のバージョンが変わるため、1件ごとに読み直す
  for (const id of ids) {
    const removed = (await (await request.get(`${api}?deleted=true`)).json())
      .elements as Created[];
    const element = removed.find((e) => e.id === id) as Created;
    const purged = await request.post(`${api}/${id}/purge`, {
      headers: { ...write, "If-Match": `"${element.version}"` },
    });
    expect(purged.status()).toBe(204);
  }
}

test.describe("#129 状態遷移図", () => {
  test("状態とシステム操作を向きのある線でつなぎ、始まりと終わりを文字で出す", async ({
    page,
  }) => {
    const { request } = page;
    // 申込済み →（審査する）→ 承認済み。申込済み → 取消済み は直接つなぐ
    let model = await create(request, "stateModel", "申込の状態");
    let applied = await create(request, "state", "申込済み");
    const approved = await create(request, "state", "承認済み");
    const cancelled = await create(request, "state", "取消済み");
    let review = await create(request, "usecase", "申込を審査する");
    for (const state of [applied, approved, cancelled])
      model = await connect(request, model, state);
    applied = await connect(request, applied, review);
    applied = await connect(request, applied, cancelled);
    review = await connect(request, review, approved);

    // 要素の一覧から状態遷移図を開く
    await page.goto("/#/elements/stateModel");
    await page.getByRole("link", { name: "状態遷移図で見る" }).click();
    await expect(
      page.getByRole("heading", { name: "状態遷移図: 申込の状態" }),
    ).toBeVisible();
    const nodes = page.getByTestId("state-node");
    await expect(nodes).toHaveCount(4);
    await expect(nodes.filter({ hasText: "申込済み" })).toContainText("始まり");
    await expect(nodes.filter({ hasText: "承認済み" })).toContainText("終わり");
    await expect(nodes.filter({ hasText: "申込を審査する" })).toContainText(
      "システム操作",
    );
    // 線は3本で、どれも矢印の向きを持つ
    await expect(page.locator(".react-flow__edge")).toHaveCount(3);
    await expect(
      page.locator(".react-flow__edge-path[marker-end]"),
    ).toHaveCount(3);
    const result = await new AxeBuilder({ page })
      .include(".chain-controls")
      .analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    // 状態を選ぶと詳細パネルを開き、パネルから状態遷移図へ戻れる
    await nodes.filter({ hasText: "取消済み" }).click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    await expect(panel.getByLabel("名前")).toHaveValue("取消済み");
    await page.screenshot({ path: `${screenshots}/s-14-state-diagram.png` });
    await expect(
      panel.getByRole("link", { name: "状態遷移図で開く" }),
    ).toHaveAttribute("href", `#/states/${model.id}`);

    await purge(request, [
      model.id,
      applied.id,
      approved.id,
      cancelled.id,
      review.id,
    ]);
  });

  test("状態の流れが見つからなければ、そのことと戻る先を出す", async ({
    page,
  }) => {
    await page.goto("/#/states/no-such-model");
    await expect(page.getByRole("alert")).toHaveText(
      "状態の流れが見つかりません。削除された可能性があります。",
    );
  });
});
