import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

// 設定を変えるため、順に動かす。最後に元の設定に戻す
test.describe.configure({ mode: "serial" });

test.describe("FR-005 プロジェクトの設定", () => {
  test("変えた項目があるときだけ保存でき、保存するとヘッダーの名前も変わる", async ({
    page,
  }) => {
    await page.goto("/#/settings");
    await expect(
      page.getByRole("heading", { name: "プロジェクトの設定" }),
    ).toBeVisible();
    const save = page.getByRole("button", { name: "保存" });
    await expect(save).toBeDisabled();
    await expect(page.getByLabel("プロジェクトの名前")).toHaveValue("社内研修");
    const result = await new AxeBuilder({ page })
      .include(".settings")
      .analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/s-12-settings.png` });

    await page.getByLabel("プロジェクトの名前").fill("社内研修の設計");
    await page.getByLabel("要約の上限（字）").fill("80");
    await save.click();
    await expect(page.getByRole("status")).toHaveText("設定を保存しました。");
    await expect(page.locator(".project-name")).toHaveText("社内研修の設計");
    await expect(save).toBeDisabled();
    const snapshot = await (
      await page.request.get("/api/projects/local/snapshot")
    ).json();
    expect(snapshot.project).toMatchObject({
      name: "社内研修の設計",
      summaryMaxLength: 80,
    });
  });

  test("要約の上限が1以上の整数でなければ、理由を出して保存させない", async ({
    page,
  }) => {
    await page.goto("/#/settings");
    await page.getByLabel("要約の上限（字）").fill("0");
    await expect(page.getByRole("alert")).toHaveText(
      "要約の上限は1以上の整数にしてください。",
    );
    await expect(page.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  test.afterAll(async ({ request }) => {
    const restored = await request.patch("/api/projects/local", {
      headers: { "X-Sujigaki-Request": "1" },
      data: { name: "社内研修", summaryMaxLength: 100 },
    });
    expect(restored.ok()).toBe(true);
  });
});
