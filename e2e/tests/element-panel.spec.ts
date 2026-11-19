import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

/** 業務フローを開いて活動を選び、詳細パネルを返す。編集する E2E は「受講の取り消し」の活動を使う */
async function openActivity(page: Page, name: string, flow = "buc-cancel") {
  await page.goto(`/#/flows/${flow}`);
  await page.getByTestId("activity-card").filter({ hasText: name }).click();
  const panel = page.getByRole("complementary", { name: "要素の詳細" });
  await expect(panel.getByRole("heading", { name, level: 2 })).toBeVisible();
  return panel;
}

// 編集のテストはモデルを変えるため、順に動かす
test.describe.configure({ mode: "serial" });

test.describe("P-01 要素の詳細パネル", () => {
  test("活動を選ぶと、内容・つながり・確認状態のボタンを出す", async ({
    page,
  }) => {
    const panel = await openActivity(page, "研修に申し込む", "buc-application");
    await expect(panel).toContainText("活動");
    await expect(panel.getByLabel("区分")).toHaveValue("system");
    await expect(panel.getByRole("list").first()).toContainText("受講者");
    await expect(
      panel.getByRole("button", { name: "「確認済み」にする" }),
    ).toBeEnabled();
    await expect(panel.getByRole("button", { name: "保存" })).toBeDisabled();
    const result = await new AxeBuilder({ page }).include(".panel").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/p-01-element-panel.png` });
  });

  test("FR-013 確認済みの活動を編集し始めると、未レビューに戻ることを知らせ、保存すると戻る", async ({
    page,
  }) => {
    const panel = await openActivity(page, "取り消しを申し出る");
    await expect(
      panel.getByRole("img", { name: "確認済み" }).first(),
    ).toBeVisible();
    await panel.getByLabel("開始のきっかけ").fill("受講者が予定を変える");
    await expect(panel.getByRole("status")).toHaveText(
      "保存すると未レビューに戻ります",
    );
    await page.screenshot({ path: `${screenshots}/p-01-editing-approved.png` });
    await panel.getByRole("button", { name: "保存" }).click();
    await expect(panel.getByText("未レビュー").first()).toBeVisible();
    await expect(panel.getByLabel("開始のきっかけ")).toHaveValue(
      "受講者が予定を変える",
    );
  });

  test("FR-030 確認状態を変えると、図のアイコンも変わる", async ({ page }) => {
    const panel = await openActivity(page, "取り消しを受け付ける");
    await panel.getByRole("button", { name: "「要確認」にする" }).click();
    const card = page
      .getByTestId("activity-card")
      .filter({ hasText: "取り消しを受け付ける" });
    await expect(card.getByRole("img", { name: "要確認" })).toBeVisible();
  });

  test("FR-070 ほかの人が先に更新していたら、衝突のダイアログで残す内容を選ぶ", async ({
    page,
  }) => {
    const panel = await openActivity(page, "取り消しを受け付ける");
    // 画面を開いたあとに、ほかの人が同じ活動の名前を変える
    const snapshot = await (
      await page.request.get("/api/projects/local/snapshot")
    ).json();
    const current = snapshot.elements.find(
      (e: { id: string }) => e.id === "act-accept-cancel",
    );
    const other = await page.request.patch(
      "/api/projects/local/elements/act-accept-cancel",
      {
        headers: {
          "X-Sujigaki-Request": "1",
          "If-Match": `"${current.version}"`,
        },
        data: { name: "取り消しの申し出を受け付ける" },
      },
    );
    expect(other.ok()).toBe(true);

    await panel.getByLabel("名前").fill("取り消しを電話で受け付ける");
    await panel.getByRole("button", { name: "保存" }).click();
    const dialog = page.getByRole("dialog", {
      name: "ほかの人が先に更新しました",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("row", { name: /名前/ })).toContainText(
      "取り消しの申し出を受け付ける",
    );
    await page.screenshot({ path: `${screenshots}/d-01-conflict.png` });

    await dialog.getByRole("button", { name: "自分の内容で上書き" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page
        .getByTestId("activity-card")
        .filter({ hasText: "取り消しを電話で受け付ける" }),
    ).toBeVisible();
  });
});
