import { type APIRequestContext, expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";
const api = "/api/projects/local/elements";
const write = { "X-Sujigaki-Request": "1" };

interface Stored {
  id: string;
  name: string;
  version: number;
}

async function create(request: APIRequestContext, kind: string, name: string) {
  const response = await request.post(api, {
    headers: write,
    data: { kind, name },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as Stored;
}

/** 後の E2E が数える要素を変えないよう、作った要素は完全に削除して片付ける */
async function purgeByName(request: APIRequestContext, names: string[]) {
  const snapshot = await (
    await request.get("/api/projects/local/snapshot")
  ).json();
  for (const e of snapshot.elements as Stored[]) {
    if (!names.includes(e.name)) continue;
    const deleted = await request.delete(`${api}/${e.id}`, {
      headers: { ...write, "If-Match": `"${e.version}"` },
    });
    expect(deleted.ok()).toBe(true);
  }
  for (const name of names) {
    const removed = (
      (await (await request.get(`${api}?deleted=true`)).json())
        .elements as Stored[]
    ).filter((e) => e.name === name);
    for (const e of removed) {
      const latest = (
        (await (await request.get(`${api}?deleted=true`)).json())
          .elements as Stored[]
      ).find((x) => x.id === e.id) as Stored;
      const purged = await request.post(`${api}/${e.id}/purge`, {
        headers: { ...write, "If-Match": `"${latest.version}"` },
      });
      expect(purged.status()).toBe(204);
    }
  }
}

const created = [
  "操作の業務",
  "操作の流れ",
  "迷子の流れ",
  "係A",
  "申込を受け付ける",
  "申込を確かめる",
];

// 業務フローを作って編集するため、順に動かす。作った要素は最後に片付ける
test.describe.configure({ mode: "serial" });

test.describe("#147 #148 #149 業務フローの操作", () => {
  test.afterAll(async ({ request }) => {
    await purgeByName(request, created);
  });

  test("足した活動を直前の活動に続け、詳細パネルで担当者を選び直す", async ({
    page,
  }) => {
    const { request } = page;
    const business = await create(request, "business", "操作の業務");
    const flow = await create(request, "buc", "操作の流れ");
    const connected = await request.post(`${api}/${business.id}/relations`, {
      headers: { ...write, "If-Match": `"${business.version}"` },
      data: { to: flow.id },
    });
    expect(connected.ok()).toBe(true);

    await page.goto(`/#/flows/${flow.id}`);
    const form = page.getByRole("form", { name: "活動を追加" });
    await form.getByLabel("担当").selectOption({ label: "＋ 新しい担当者" });
    await form.getByLabel("新しい担当者の名前").fill("係A");
    await form.getByLabel("活動の名前").fill("申込を受け付ける");
    await form.getByRole("button", { name: "＋ 活動を追加" }).click();
    const cards = page.getByTestId("activity-card");
    await expect(cards).toHaveCount(1);

    // 2つ目の活動は、1つ目の次に続ける
    const follow = form.getByLabel("「申込を受け付ける」の次に続ける");
    await expect(follow).toBeChecked();
    await form.getByLabel("活動の名前").fill("申込を確かめる");
    await form.getByRole("button", { name: "＋ 活動を追加" }).click();
    await expect(cards).toHaveCount(2);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    // 詳細パネルで担当者を外すと、担当者が未設定のレーンに移る
    await cards.filter({ hasText: "申込を確かめる" }).click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    const actor = panel.getByLabel("担当者");
    await expect(actor.locator("option:checked")).toHaveText("係A");
    await page.screenshot({ path: `${screenshots}/s-04-follow-actor.png` });
    await actor.selectOption({ label: "担当者が未設定" });
    await expect(
      page.locator(".lane-name", { hasText: "担当者が未設定" }),
    ).toBeVisible();
    // 選び直しは1回の操作として元に戻せる
    await expect(page.locator(".undo-label")).toHaveText(
      "「申込を確かめる」の担当者の変更",
    );
    await actor.selectOption({ label: "係A" });
    await expect(
      page.locator(".lane-name", { hasText: "担当者が未設定" }),
    ).toHaveCount(0);
  });

  test("業務に属さない業務フローを、業務一覧から業務に入れる", async ({
    page,
  }) => {
    await create(page.request, "buc", "迷子の流れ");
    await page.goto("/#/");
    const assign = page.getByLabel("業務フロー「迷子の流れ」を入れる業務");
    await assign.selectOption({ label: "操作の業務" });
    const row = page.locator(".business-row", {
      has: page.getByRole("heading", { name: "操作の業務" }),
    });
    await expect(row.getByRole("link", { name: "迷子の流れ" })).toBeVisible();
    await expect(assign).toHaveCount(0);
  });
});
