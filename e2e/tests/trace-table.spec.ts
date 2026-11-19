import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

test.describe("FR-025 トレース表", () => {
  test("画面につながらないシステム操作の行で、画面の列を「なし」として強調する", async ({
    page,
  }) => {
    await page.goto("/#/trace");
    await expect(
      page.getByRole("heading", { name: "トレース表" }),
    ).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "受講を申し込む" });
    // 列の順: 要求・業務・業務フロー・活動・システム操作・画面・情報
    const screenCell = row.getByRole("cell").nth(5);
    await expect(screenCell).toHaveText("なし");
    await expect(screenCell).toHaveClass(/gap/);
    // 例のモデルでは、情報は活動からつながっていて、システム操作からはつながっていない
    await expect(row.getByRole("cell").nth(6)).toHaveText("なし");
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/s-07-trace-table.png` });
  });

  test("途切れている行だけに絞り込み、列で並べ替えられる", async ({ page }) => {
    await page.goto("/#/trace");
    const rows = page.locator("tbody tr");
    // 行を読み込む前に数えると0件になるため、先に表が出るのを待つ
    await expect(rows.first()).toBeVisible();
    const total = await rows.count();
    await page.getByLabel("途切れている行だけ").check();
    // 絞り込んだあとは、途切れたセルのない行が残らない
    await expect(rows.filter({ hasNot: page.locator("td.gap") })).toHaveCount(
      0,
    );
    expect(await rows.count()).toBeLessThanOrEqual(total);
    await page.getByRole("button", { name: "活動" }).click();
    await expect(
      page.getByRole("columnheader", { name: /活動/ }),
    ).toHaveAttribute("aria-sort", "ascending");
  });

  test("セルの要素を選ぶと、詳細パネルを開く", async ({ page }) => {
    await page.goto("/#/trace");
    await page.getByRole("button", { name: "受講を申し込む" }).first().click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    await expect(
      panel.getByRole("heading", { name: "受講を申し込む", level: 2 }),
    ).toBeVisible();
  });
});
