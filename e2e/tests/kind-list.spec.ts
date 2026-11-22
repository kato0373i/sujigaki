import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

test.describe("#128 要素の一覧", () => {
  test("種類を選ぶと、その種類の要素を出し、選んだ要素の詳細パネルを開く", async ({
    page,
  }) => {
    await page.goto("/#/");
    await page.getByRole("link", { name: "要素の一覧" }).click();
    // 種類を選ばずに開くと、要素のある最初の種類（要求）を出す
    await expect(page.getByRole("heading", { name: "要求" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "研修の申込をかんたんにしたい" }),
    ).toBeVisible();

    const kinds = page.getByRole("list", { name: "種類" });
    await kinds.getByRole("link", { name: /^情報/ }).click();
    await expect(page).toHaveURL(/#\/elements\/information$/);
    const row = page.getByRole("row").filter({ hasText: "受講申込" });
    await expect(row.getByRole("cell").nth(1)).toContainText("未レビュー");
    await expect(row.getByRole("cell").nth(3)).not.toHaveText("0");
    // 要素のない種類も、数を0として出す
    await expect(kinds.getByRole("link", { name: /^区分/ })).toContainText("0");
    const result = await new AxeBuilder({ page }).include(".screen").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    await row.getByRole("button", { name: "受講申込" }).click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    await expect(panel.getByLabel("名前")).toHaveValue("受講申込");
    await page.screenshot({ path: `${screenshots}/s-13-elements.png` });
  });

  test("絞り込みと追加ができ、追加した要素の詳細パネルを開く", async ({
    page,
  }) => {
    await page.goto("/#/elements/actor");
    // 前の E2E が登場人物を足したり名前を変えたりするため、名前を変えない「上長」で確かめる
    await page.getByLabel("絞り込み").fill("上長");
    const rows = page.locator("tbody tr");
    await expect(rows.filter({ hasText: "上長" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "研修担当" })).toHaveCount(0);
    await page.getByLabel("絞り込み").fill("返金");
    await expect(page.getByText("当てはまる要素はありません。")).toBeVisible();

    await page.goto("/#/elements/state");
    await expect(page.getByText("状態の要素はありません。")).toBeVisible();
    await page.getByLabel("新しい状態の名前").fill("審査中");
    await page.getByRole("button", { name: "＋ 状態を追加" }).click();
    await expect(page.getByRole("button", { name: "審査中" })).toBeVisible();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    await expect(panel.getByLabel("名前")).toHaveValue("審査中");

    // 後の E2E が数える要素を変えないよう、作った要素は完全に削除して片付ける
    const snapshot = await (
      await page.request.get("/api/projects/local/snapshot")
    ).json();
    const state = snapshot.elements.find(
      (e: { name: string }) => e.name === "審査中",
    );
    const headers = (version: number) => ({
      "X-Sujigaki-Request": "1",
      "If-Match": `"${version}"`,
    });
    const deleted = await page.request.delete(
      `/api/projects/local/elements/${state.id}`,
      { headers: headers(state.version) },
    );
    expect(deleted.ok()).toBe(true);
    const removed = (
      await (
        await page.request.get("/api/projects/local/elements?deleted=true")
      ).json()
    ).elements.find((e: { id: string }) => e.id === state.id);
    const purged = await page.request.post(
      `/api/projects/local/elements/${state.id}/purge`,
      { headers: headers(removed.version) },
    );
    expect(purged.status()).toBe(204);
  });
});

test.describe("#182 種類のまとまり", () => {
  test("種類を、価値と関係者・業務・システムとの境目・情報と状態の見出しでまとめる", async ({
    page,
  }) => {
    await page.goto("/#/elements");
    const kinds = page.getByRole("list", { name: "種類" });
    for (const [group, kind] of [
      ["価値と関係者", "要求"],
      ["業務", "活動"],
      ["システムとの境目", "画面"],
      ["情報と状態", "情報"],
    ] as const) {
      await expect(
        kinds
          .getByRole("list", { name: group, exact: true })
          .getByRole("link", { name: new RegExp(`^${kind}`) }),
      ).toBeVisible();
    }
    await page.screenshot({ path: `${screenshots}/s-13-groups.png` });
  });
});
