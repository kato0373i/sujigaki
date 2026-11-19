import { readFile, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";
const training = "e2e/.work/training/businesses/biz-training.yaml";
const message =
  "確認したあとに、ツールの外で内容が変わっています。内容を確かめ直してください。";

// ファイルを外で書き換え、確認状態も変えるため、順に動かす
test.describe.configure({ mode: "serial" });

test.describe("FR-041 確認したあとに内容が変わった要素", () => {
  test("確認済みの要素をファイルで直接書き換えると、検証の違反として出る", async ({
    page,
  }) => {
    const text = await readFile(training, "utf8");
    await writeFile(
      training,
      text.replace(
        "    name: 申込を承認する\n",
        "    name: 申込を承認する\n    summary: 上長がメールで承認する\n",
      ),
    );

    await page.goto("/#/board");
    await page.getByLabel("絞り込み").selectOption("fix");
    const region = page.getByRole("region", { name: "研修" });
    await expect(region).toContainText(message);
    const result = await new AxeBuilder({ page }).include(".main").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/fr-041-review-drift.png` });
  });

  test("再確認を依頼すると、違反が消えて要確認になる", async ({ page }) => {
    await page.goto("/#/board");
    await page.getByLabel("絞り込み").selectOption("fix");
    const region = page.getByRole("region", { name: "研修" });
    await region
      .getByRole("button", { name: "申込を承認する" })
      .first()
      .click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    await panel.getByRole("button", { name: "「要確認」にする" }).click();
    await expect(panel.getByText("要確認", { exact: true })).toBeVisible();
    await expect(region).not.toContainText(message);
  });
});
