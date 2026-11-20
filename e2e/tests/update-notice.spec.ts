import { readFile, rename, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";
const billing = "e2e/.work/training/businesses/biz-billing.yaml";

/** エディターで書き換えたときのように、業務「請求」のファイルの名前を外で変える */
async function renameOutside(from: string, to: string) {
  const text = await readFile(billing, "utf8");
  // 書きかけのファイルを読まれないよう、一時ファイルに書いてから置き換える
  await writeFile(
    `${billing}.tmp`,
    text.replace(`name: ${from}\n`, `name: ${to}\n`),
  );
  await rename(`${billing}.tmp`, billing);
}

/** タブに戻ったときと同じく、すぐに更新を確かめさせる */
async function returnToTab(page: Page) {
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
}

// ファイルを外で書き換えるため、順に動かす。ほかの E2E より後に動く名前にしている
test.describe.configure({ mode: "serial" });

test.describe("FR-071 ほかの人の更新を知らせる", () => {
  test("ファイルが外で変わると件数を出し、再読み込みで新しい内容にする", async ({
    page,
  }) => {
    await page.goto("/#/");
    await expect(
      page.locator(".business-row", { hasText: "請求" }),
    ).toBeVisible();
    await returnToTab(page);
    await expect(page.locator(".update-notice")).toHaveCount(0);

    await renameOutside("請求", "請求と入金");
    await returnToTab(page);
    const notice = page.locator(".update-notice");
    await expect(notice.getByRole("status")).toHaveText("1件の更新があります");
    const result = await new AxeBuilder({ page }).include(".header").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/fr-071-update-notice.png` });

    await notice.getByRole("button", { name: "再読み込み" }).click();
    await expect(
      page.locator(".business-row", { hasText: "請求と入金" }),
    ).toBeVisible();
    await expect(notice).toHaveCount(0);
  });

  test("詳細パネルに保存していない変更があれば、再読み込みの前に確かめる", async ({
    page,
  }) => {
    await page.goto("/#/flows/buc-cancel");
    await page
      .getByTestId("activity-card")
      .filter({ hasText: "取り消しを申し出る" })
      .click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    await panel.getByLabel("名前").fill("取り消しを申し出る（下書き）");

    await renameOutside("請求と入金", "請求");
    await returnToTab(page);
    await page.getByRole("button", { name: "再読み込み" }).click();
    const dialog = page.getByRole("dialog", {
      name: "保存していない変更があります",
    });
    await dialog.getByRole("button", { name: "やめる" }).click();
    await expect(panel.getByLabel("名前")).toHaveValue(
      "取り消しを申し出る（下書き）",
    );

    await page.getByRole("button", { name: "再読み込み" }).click();
    await dialog
      .getByRole("button", { name: "変更を捨てて再読み込み" })
      .click();
    await expect(panel.getByLabel("名前")).toHaveValue("取り消しを申し出る");
    await expect(page.locator(".update-notice")).toHaveCount(0);
  });
});
