import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

// 編集のテストはモデルを変えるため、順に動かす。ほかの E2E が確かめない「受講の取り消し」を使う
test.describe.configure({ mode: "serial" });

test.describe("P-01 詳細パネルでつながりを編集する", () => {
  test("担当者のつながりを外して別の担当者につなぐと、カードがそのレーンに移る", async ({
    page,
  }) => {
    await page.goto("/#/flows/buc-cancel");
    await page
      .getByTestId("activity-card")
      .filter({ hasText: "取り消しを電話で受け付ける" })
      .click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    const relations = panel.getByRole("region", { name: "つながり" });
    // ほかの要素から自分へのつながり（業務フロー）も出す
    await expect(relations).toContainText("受講の取り消し");

    await relations
      .getByRole("button", { name: "「研修担当」とのつながりを外す" })
      .click();
    await expect(relations).not.toContainText("研修担当");

    await relations.getByRole("button", { name: "＋ つなぐ" }).click();
    await relations.getByLabel("つなぐ要素を名前で探す").fill("上");
    const candidates = relations.getByRole("list", { name: "つなげる要素" });
    await expect(candidates).toContainText("上長");
    const result = await new AxeBuilder({ page }).include(".panel").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/p-01-relation-search.png` });

    await candidates.getByRole("button", { name: /上長/ }).click();
    await expect(relations).toContainText("上長");
    await expect(page.locator(".lane-name", { hasText: "上長" })).toBeVisible();
  });

  test("FR-001 つなげない種類の要素は、候補に出さない", async ({ page }) => {
    await page.goto("/#/flows/buc-cancel");
    await page
      .getByTestId("activity-card")
      .filter({ hasText: "取り消しを申し出る" })
      .click();
    const relations = page
      .getByRole("complementary", { name: "要素の詳細" })
      .getByRole("region", { name: "つながり" });
    await relations.getByRole("button", { name: "＋ つなぐ" }).click();
    // 活動と業務はつなげない（業務は業務フローを通してつながる）
    await relations.getByLabel("つなぐ要素を名前で探す").fill("請求");
    await expect(relations).toContainText("つなげる要素が見つかりません。");
  });
});
