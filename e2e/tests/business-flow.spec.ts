import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

test.describe("FR-020 業務一覧から業務フローを開く", () => {
  test("業務一覧に、業務ごとの業務フローと確認状態の数が出る", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "業務一覧" })).toBeVisible();
    const training = page.locator(".business-row", { hasText: "研修" });
    await expect(
      training.getByRole("link", { name: "研修の受講申込" }),
    ).toBeVisible();
    await expect(
      training.getByRole("link", { name: "受講の取り消し" }),
    ).toBeVisible();
    await expect(
      page.locator(".business-row", { hasText: "請求" }),
    ).toContainText("業務フローがありません。");
    await page.screenshot({
      path: `${screenshots}/s-03-business-list.png`,
      fullPage: true,
    });
  });

  test("業務フローでは、担当者ごとのレーンに活動が並び、区分を色以外でも区別する", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("main")
      .getByRole("link", { name: "研修の受講申込" })
      .click();
    await expect(
      page.getByRole("heading", { name: "業務フロー: 研修の受講申込" }),
    ).toBeVisible();

    for (const lane of ["受講者", "上長", "研修担当", "担当者が未設定"]) {
      await expect(page.locator(".lane-name", { hasText: lane })).toBeVisible();
    }
    const cards = page.getByTestId("activity-card");
    await expect(cards).toHaveCount(4);
    const apply = cards.filter({ hasText: "研修に申し込む" });
    await expect(apply).toContainText("システム");
    await expect(apply).toContainText("受講を申し込む");
    await expect(apply).toContainText("情報 1");
    await expect(cards.filter({ hasText: "受講案内を送る" })).toContainText(
      "手作業",
    );
    await expect(
      cards
        .filter({ hasText: "申込を承認する" })
        .getByRole("img", { name: "確認済み" }),
    ).toBeVisible();
    // システム利用なのにシステム操作につながらない活動には、検証の違反を出す
    await expect(
      cards
        .filter({ hasText: "申込を承認する" })
        .getByRole("img", { name: /^検証の違反/ }),
    ).toBeVisible();
    await page.screenshot({ path: `${screenshots}/s-04-business-flow.png` });
  });

  test("NFR-017 業務一覧と業務フローに、アクセシビリティの違反がない", async ({
    page,
  }) => {
    for (const path of ["/", "/#/flows/buc-application"]) {
      await page.goto(path);
      await page.getByRole("heading", { level: 1 }).waitFor();
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    }
  });
});
