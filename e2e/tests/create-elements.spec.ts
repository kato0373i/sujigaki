import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

/** ヘッダーの検索で要素を開き、詳細パネルを返す */
async function openBySearch(page: Page, name: string) {
  await page.getByRole("searchbox", { name: "要素を検索" }).fill(name);
  await page
    .getByRole("list", { name: "検索の結果" })
    .getByRole("button", { name: new RegExp(`${name}$`) })
    .click();
  const panel = page.getByRole("complementary", { name: "要素の詳細" });
  await expect(panel.getByRole("heading", { name, level: 2 })).toBeVisible();
  return panel;
}

async function elementNamed(page: Page, name: string) {
  const snapshot = await (
    await page.request.get("/api/projects/local/snapshot")
  ).json();
  return snapshot.elements.find((e: { name: string }) => e.name === name);
}

// 要素を作るため、順に動かす。ほかの E2E が確かめない新しい業務の中で作る
test.describe.configure({ mode: "serial" });

test.describe("FR-010 要素を新しく作る", () => {
  test("業務一覧で業務を追加し、その業務に業務フローを追加する", async ({
    page,
  }) => {
    await page.goto("/#/");
    await page.getByLabel("新しい業務の名前").fill("受付業務");
    await page.getByRole("button", { name: "＋ 業務を追加" }).click();
    const row = page.locator(".business-row", { hasText: "受付業務" });
    await expect(row).toContainText("業務フローがありません。");

    await row
      .getByRole("button", { name: "業務「受付業務」に業務フローを追加" })
      .click();
    await row
      .getByLabel("業務「受付業務」の新しい業務フローの名前")
      .fill("窓口受付");
    const result = await new AxeBuilder({ page }).include(".screen").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/s-03-add.png` });
    await row.getByRole("button", { name: "追加", exact: true }).click();
    await expect(row.getByRole("link", { name: "窓口受付" })).toBeVisible();

    const business = await elementNamed(page, "受付業務");
    const flow = await elementNamed(page, "窓口受付");
    expect(business.relations).toEqual([
      expect.objectContaining({ typeId: "business-buc", to: flow.id }),
    ]);
  });

  test("詳細パネルの「＋ つなぐ」で、探した名前の要素を新しく作ってつなぐ", async ({
    page,
  }) => {
    await page.goto("/#/");
    const flowPanel = await openBySearch(page, "窓口受付");
    await flowPanel.getByRole("button", { name: "＋ つなぐ" }).click();
    await flowPanel
      .getByLabel("つなぐ要素を名前で探す")
      .fill("窓口で受け付ける");
    await flowPanel
      .getByLabel("新しく作る種類")
      .selectOption({ label: "活動" });
    await page.screenshot({ path: `${screenshots}/p-01-create.png` });
    await flowPanel
      .getByRole("button", { name: "「窓口で受け付ける」を新しく作ってつなぐ" })
      .click();
    await expect(flowPanel.locator(".relations")).toContainText(
      "窓口で受け付ける",
    );

    // 要求は業務とのつながりを持つ側なので、新しい要求の側からつなぐ
    const businessPanel = await openBySearch(page, "受付業務");
    await businessPanel.getByRole("button", { name: "＋ つなぐ" }).click();
    await businessPanel
      .getByLabel("つなぐ要素を名前で探す")
      .fill("受付を早くしたい");
    await businessPanel
      .getByLabel("新しく作る種類")
      .selectOption({ label: "要求" });
    await businessPanel
      .getByRole("button", { name: "「受付を早くしたい」を新しく作ってつなぐ" })
      .click();
    await expect(businessPanel.locator(".relations")).toContainText(
      "受付を早くしたい",
    );

    const business = await elementNamed(page, "受付業務");
    const requirement = await elementNamed(page, "受付を早くしたい");
    expect(requirement).toMatchObject({
      kind: "requirement",
      relations: [
        expect.objectContaining({
          typeId: "requirement-business",
          to: business.id,
        }),
      ],
    });
    const activity = await elementNamed(page, "窓口で受け付ける");
    expect((await elementNamed(page, "窓口受付")).relations).toEqual([
      expect.objectContaining({ typeId: "buc-activity", to: activity.id }),
    ]);
  });
});
