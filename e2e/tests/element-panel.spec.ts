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

  test("#123 活動の流れの順は、前の活動と次の活動として出す", async ({
    page,
  }) => {
    const panel = await openActivity(page, "申込を承認する", "buc-application");
    const relations = panel.getByRole("region", { name: "つながり" });
    // つながりは種類ごとにまとめ、見出しに件数を添える（#160）
    await expect(
      relations.locator(".relation-group", { hasText: "前の活動" }),
    ).toContainText("研修に申し込む");
    await expect(
      relations.locator(".relation-group", { hasText: "次の活動" }),
    ).toContainText("受講案内を送る");
    await relations.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshots}/p-01-direction.png` });
  });
});

test.describe("#172 #178 #179 詳細パネルの見やすさ", () => {
  test("節を畳むと件数を見出しに出し、ほかの要素を開いても畳んだままにする", async ({
    page,
  }) => {
    const panel = await openActivity(page, "研修に申し込む", "buc-application");
    const relations = panel.getByRole("region", { name: "つながり" });
    const toggle = relations.getByRole("button", {
      name: "つながり",
      exact: true,
    });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(relations.locator(".relations")).toBeHidden();
    await expect(relations.getByRole("heading")).toContainText(/\d+件/);

    // 今の確認状態を、節の先頭に出す
    await expect(panel.locator(".review-current")).toContainText("未レビュー");
    await page.screenshot({ path: `${screenshots}/p-01-folded.png` });

    const other = await openActivity(page, "申込を承認する", "buc-application");
    await expect(
      other
        .getByRole("region", { name: "つながり" })
        .getByRole("button", { name: "つながり", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await other.getByRole("button", { name: "つながり", exact: true }).click();
    await expect(other.locator(".relations")).toBeVisible();
  });

  test("「外す」は行にマウスを乗せると出し、件数は2件以上の種類にだけ付ける。保存のボタンは下端に見える", async ({
    page,
  }) => {
    const panel = await openActivity(page, "研修に申し込む", "buc-application");
    const row = panel.locator(".relation-group li").first();
    const remove = row.getByRole("button", { name: /とのつながりを外す$/ });
    await expect(remove).toHaveCSS("opacity", "0");
    await row.hover();
    await expect(remove).toHaveCSS("opacity", "1");
    for (const group of await panel.locator("li.relation-group").all()) {
      const items = await group.locator("ul li").count();
      await expect(group.locator(".count")).toHaveCount(items > 1 ? 1 : 0);
    }

    // 内容の節のいちばん上の欄を書いているときも、保存のボタンが見える
    await panel.getByLabel("名前").focus();
    const save = await panel
      .getByRole("button", { name: "保存" })
      .boundingBox();
    const viewport = page.viewportSize();
    expect(save && viewport && save.y + save.height <= viewport.height).toBe(
      true,
    );
  });
});
