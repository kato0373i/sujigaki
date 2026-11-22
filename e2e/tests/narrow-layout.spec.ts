import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

test.describe("#171 幅が狭い画面", () => {
  test("幅が 768px より狭いと、ナビを畳み、「メニュー」で開く。画面は横にはみ出さない", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/#/");
    const nav = page.getByRole("navigation", { name: "業務" });
    const menu = page.getByRole("button", { name: "メニュー" });
    await expect(nav).toBeHidden();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("heading", { name: "業務一覧" })).toBeVisible();
    const overflow = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
    expect(await overflow()).toBe(0);
    await page.screenshot({ path: `${screenshots}/narrow-list.png` });

    await menu.click();
    await expect(nav).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/narrow-nav.png` });
    // Esc で閉じる
    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();

    // リンクを選ぶと、移った先でナビを閉じる
    await menu.click();
    await nav.getByRole("link", { name: "確認ボード" }).click();
    await expect(
      page.getByRole("heading", { name: "確認ボード" }),
    ).toBeVisible();
    await expect(nav).toBeHidden();
    expect(await overflow()).toBe(0);
  });

  test("幅が 1280px より狭いと、詳細パネルを図に重ねて開き、図の幅を残す", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/#/flows/buc-cancel");
    await page
      .getByTestId("activity-card")
      .filter({ hasText: "取り消しを申し出る" })
      .click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    await expect(panel).toBeVisible();
    const flow = await page.locator(".flow-canvas").boundingBox();
    // ナビの 240px を除いた幅を、ほぼそのまま図に使う
    expect(flow?.width ?? 0).toBeGreaterThan(700);
    await page.screenshot({ path: `${screenshots}/narrow-panel.png` });
  });
});
