import { expect, test } from "@playwright/test";

test.describe("#113 開いた欄にフォーカスを移す", () => {
  test("「＋ 業務フローを追加」と「＋ つなぐ」で開いた欄に、そのまま入力できる", async ({
    page,
  }) => {
    await page.goto("/#/");
    await page
      .getByRole("button", { name: "業務「請求」に業務フローを追加" })
      .click();
    await page.keyboard.type("請求書の発行");
    await expect(
      page.getByLabel("業務「請求」の新しい業務フローの名前"),
    ).toHaveValue("請求書の発行");
    await expect(page.getByLabel("新しい業務の名前")).toHaveValue("");
    await page.getByRole("button", { name: "やめる" }).click();

    await page.goto("/#/flows/buc-cancel");
    await page
      .getByTestId("activity-card")
      .filter({ hasText: "取り消しを申し出る" })
      .click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    await panel.getByRole("button", { name: "＋ つなぐ" }).click();
    await page.keyboard.type("研修");
    await expect(panel.getByLabel("つなぐ要素を名前で探す")).toHaveValue(
      "研修",
    );
    await expect(
      page.getByRole("searchbox", { name: "要素を検索" }),
    ).toHaveValue("");
  });
});
