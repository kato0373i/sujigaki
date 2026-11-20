import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

test.describe("#112 保存していない変更を捨てる前に確かめる", () => {
  test("ほかの要素を開くときと画面を移るときに確かめ、やめれば書きかけを残す", async ({
    page,
  }) => {
    await page.goto("/#/flows/buc-cancel");
    const cards = page.getByTestId("activity-card");
    await cards.filter({ hasText: "取り消しを申し出る" }).click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    const name = panel.getByLabel("名前");
    await expect(name).toHaveValue("取り消しを申し出る");
    await name.fill("取り消しを申し出る（書きかけ）");

    // ほかの要素を開く
    await cards.filter({ hasText: "取り消しを電話で受け付ける" }).click();
    const dialog = page.getByRole("dialog", {
      name: "保存していない変更があります",
    });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: `${screenshots}/p-01-unsaved.png` });
    await dialog.getByRole("button", { name: "やめる" }).click();
    await expect(name).toHaveValue("取り消しを申し出る（書きかけ）");

    // 画面を移る
    await page.getByRole("link", { name: "確認ボード" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "やめる" }).click();
    await expect(page).toHaveURL(/#\/flows\/buc-cancel$/);
    await expect(name).toHaveValue("取り消しを申し出る（書きかけ）");

    await page.getByRole("link", { name: "確認ボード" }).click();
    await dialog.getByRole("button", { name: "変更を捨てて移る" }).click();
    await expect(page).toHaveURL(/#\/board$/);
    await expect(
      page.getByRole("heading", { name: "確認ボード" }),
    ).toBeVisible();
  });
});
