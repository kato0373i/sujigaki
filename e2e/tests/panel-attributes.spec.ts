import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

/** 詳細パネルの「＋ つなぐ」で、新しい要素を作ってつなぐ */
async function createConnected(page: Page, name: string, kindLabel: string) {
  const panel = page.getByRole("complementary", { name: "要素の詳細" });
  await panel.getByRole("button", { name: "＋ つなぐ" }).click();
  await panel.getByLabel("つなぐ要素を名前で探す").fill(name);
  await panel.getByLabel("新しく作る種類").selectOption({ label: kindLabel });
  await panel
    .getByRole("button", { name: `「${name}」を新しく作ってつなぐ` })
    .click();
  await expect(
    panel.getByRole("region", { name: "つながり" }).locator(".relations"),
  ).toContainText(name);
}

async function open(page: Page, label: string, name: string) {
  await page.getByRole("searchbox", { name: "要素を検索" }).fill(name);
  await page.getByRole("button", { name: `${label} ${name}` }).click();
  const panel = page.getByRole("complementary", { name: "要素の詳細" });
  await expect(panel.getByRole("heading", { name, level: 2 })).toBeVisible();
  return panel;
}

async function attributesOf(page: Page, name: string) {
  const snapshot = await (
    await page.request.get("/api/projects/local/snapshot")
  ).json();
  return snapshot.elements.find((e: { name: string }) => e.name === name)
    .attributes;
}

// 要素を作って編集するため、順に動かす。要素を新しく作る E2E で作った活動から作る
test.describe.configure({ mode: "serial" });

test.describe("FR-011 情報の項目と区分の値", () => {
  test("#154 情報の項目を、項目名と説明の表で書く", async ({ page }) => {
    await page.goto("/#/");
    await open(page, "活動", "窓口で受け付ける");
    await createConnected(page, "受付票", "情報");

    const panel = await open(page, "情報", "受付票");
    const items = panel.getByRole("group", { name: "項目" });
    await items.getByRole("button", { name: "＋ 項目を追加" }).click();
    await items.getByLabel("1行目の項目名").fill("受付日");
    await items.getByLabel("1行目の説明").fill("窓口で受け付けた日");
    await items.getByRole("button", { name: "＋ 項目を追加" }).click();
    await items.getByLabel("2行目の項目名").fill("氏名");
    const result = await new AxeBuilder({ page }).include(".panel").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/p-01-items.png` });
    await panel.getByRole("button", { name: "保存" }).click();
    // 保存が終わり、書きかけがなくなってから読み直す
    await expect(panel.getByRole("button", { name: "保存" })).toBeDisabled();
    await expect(items.getByLabel("1行目の説明")).toHaveValue(
      "窓口で受け付けた日",
    );
    await expect(items.getByLabel("2行目の項目名")).toHaveValue("氏名");
    expect(await attributesOf(page, "受付票")).toEqual({
      items: [
        { name: "受付日", description: "窓口で受け付けた日" },
        { name: "氏名" },
      ],
    });
  });

  test("区分の値を1行に1つ書く", async ({ page }) => {
    await page.goto("/#/");
    await open(page, "情報", "受付票");
    await createConnected(page, "受付の方法", "区分");

    const panel = await open(page, "区分", "受付の方法");
    await panel.getByLabel(/^区分の値/).fill("窓口\n電話\nメール");
    await panel.getByRole("button", { name: "保存" }).click();
    await expect(panel.getByRole("button", { name: "保存" })).toBeDisabled();
    await expect(panel.getByLabel(/^区分の値/)).toHaveValue(
      "窓口\n電話\nメール",
    );
    expect(await attributesOf(page, "受付の方法")).toEqual({
      values: ["窓口", "電話", "メール"],
    });
  });
});
