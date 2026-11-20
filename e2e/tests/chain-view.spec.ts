import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

test.describe("FR-021 連鎖ビュー", () => {
  test("画面を起点にすると、要求までの経路にある要素を強調する", async ({
    page,
  }) => {
    await page.goto("/#/chain/screen-notice");
    await expect(
      page.getByRole("heading", { name: "連鎖ビュー: 画面「受講案内の画面」" }),
    ).toBeVisible();
    await page.getByLabel("前後").selectOption("4");
    const highlighted = page.locator(".chain-highlighted");
    for (const name of [
      "受講案内の画面",
      "受講案内を作る",
      "受講案内を送る",
      "研修",
      "研修の申込をかんたんにしたい",
    ]) {
      await expect(
        highlighted.filter({ has: page.getByText(name, { exact: true }) }),
      ).toBeVisible();
    }
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/s-05-chain-view.png` });
  });

  test("どこにもつながっていない要素は、その要素だけを描き、そのことを出す", async ({
    page,
  }) => {
    await page.goto("/#/chain/biz-billing");
    await expect(
      page.getByText("つながっている要素はありません。"),
    ).toBeVisible();
    await expect(page.getByTestId("chain-node")).toHaveCount(1);
  });

  test("FR-022 プリセットを切り替え、次に開いたときも同じ設定で開く", async ({
    page,
  }) => {
    await page.goto("/#/chain/act-notify");
    await page.getByRole("combobox", { name: "表示" }).selectOption("screens");
    await expect(
      page.getByTestId("chain-node").filter({ hasText: "受講案内の画面" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("chain-node").filter({ hasText: "研修" }),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "表示" })).toHaveValue(
      "screens",
    );
  });

  test("FR-023 表示していない種類の要素の数をバッジで出し、押すとその種類も描く", async ({
    page,
  }) => {
    await page.goto("/#/chain/act-notify");
    const notify = page
      .getByTestId("chain-node")
      .filter({ hasText: "受講案内を送る" });
    await notify.getByRole("button", { name: "登場人物 1" }).click();
    await expect(
      page.getByTestId("chain-node").filter({ hasText: "研修担当" }),
    ).toBeVisible();
  });

  test("詳細パネルの「連鎖ビューで開く」から、その要素を起点に開く", async ({
    page,
  }) => {
    await page.goto("/#/flows/buc-application");
    await page
      .getByTestId("activity-card")
      .filter({ hasText: "研修に申し込む" })
      .click();
    await page.getByRole("link", { name: "連鎖ビューで開く" }).click();
    await expect(
      page.getByRole("heading", { name: "連鎖ビュー: 活動「研修に申し込む」" }),
    ).toBeVisible();
  });
});
