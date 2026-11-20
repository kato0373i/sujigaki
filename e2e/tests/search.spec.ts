import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

test.describe("FR-026 要素の検索", () => {
  test("業務一覧で選ぶと、その要素を起点に連鎖ビューと詳細パネルを開く", async ({
    page,
  }) => {
    await page.goto("/#/");
    await page.getByRole("searchbox", { name: "要素を検索" }).fill("申し込");
    const results = page.getByRole("list", { name: "検索の結果" });
    await expect(results.getByRole("button")).toHaveText([
      "活動 研修に申し込む",
      "システム操作 受講を申し込む",
    ]);
    const result = await new AxeBuilder({ page }).include(".header").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/fr-026-search.png` });

    await results.getByRole("button", { name: "活動 研修に申し込む" }).click();
    await expect(page).toHaveURL(/#\/chain\/act-apply$/);
    await expect(
      page
        .getByRole("complementary", { name: "要素の詳細" })
        .getByRole("heading", { name: "研修に申し込む", level: 2 }),
    ).toBeVisible();
    await expect(results).toHaveCount(0);
  });

  test("詳細パネルを出す画面では、その画面のまま詳細パネルを開く", async ({
    page,
  }) => {
    await page.goto("/#/flows/buc-application");
    await page.getByRole("searchbox", { name: "要素を検索" }).fill("受講申込");
    await page.getByRole("button", { name: "情報 受講申込" }).click();
    await expect(page).toHaveURL(/#\/flows\/buc-application$/);
    await expect(
      page
        .getByRole("complementary", { name: "要素の詳細" })
        .getByRole("heading", { name: "受講申込", level: 2 }),
    ).toBeVisible();
  });

  test("当てはまる要素がなければ、そのことを出す", async ({ page }) => {
    await page.goto("/#/");
    await page.getByRole("searchbox", { name: "要素を検索" }).fill("返金");
    await expect(page.getByRole("status")).toHaveText(
      "「返金」に当てはまる要素はありません。",
    );
  });

  test("#125 候補を↓キーで選び、Enter で開く", async ({ page }) => {
    await page.goto("/#/flows/buc-application");
    const box = page.getByRole("searchbox", { name: "要素を検索" });
    await box.fill("受講申込");
    const results = page.getByRole("list", { name: "検索の結果" });
    await expect(results.getByRole("button")).toHaveText([
      "業務フロー 研修の受講申込",
      "情報 受講申込",
    ]);
    await box.press("ArrowDown");
    await expect(results.getByRole("button").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      results.getByRole("button", { name: "情報 受講申込" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByRole("complementary", { name: "要素の詳細" })
        .getByRole("heading", { name: "受講申込", level: 2 }),
    ).toBeVisible();
  });
});
