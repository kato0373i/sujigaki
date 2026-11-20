import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

// リンクを付けるため、順に動かす。要素を新しく作る E2E で作った活動を使う
test.describe.configure({ mode: "serial" });

test.describe("FR-004 外部リンク", () => {
  test("種類と URL を入れてリンクを付け、外せる。URL の形式が違えば保存しない", async ({
    page,
  }) => {
    await page.goto("/#/");
    await page
      .getByRole("searchbox", { name: "要素を検索" })
      .fill("窓口で受け付ける");
    await page.getByRole("button", { name: "活動 窓口で受け付ける" }).click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    const links = panel.getByRole("region", { name: "外部リンク" });

    await links.getByRole("button", { name: "＋ リンクを追加" }).click();
    await links.getByLabel("URL").fill("intranet/manual");
    await links.getByRole("button", { name: "リンクを付ける" }).click();
    await expect(panel.getByRole("alert")).toHaveText(
      "リンクの URL は http:// か https:// で始めてください。",
    );

    await links
      .getByLabel("リンクの種類")
      .selectOption({ label: "マニュアル" });
    await links.getByLabel("URL").fill("https://example.com/manual");
    await links.getByLabel("リンクの名前（任意）").fill("受付の手順書");
    const result = await new AxeBuilder({ page }).include(".panel").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await links.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshots}/p-01-links.png` });
    const before = await panel.evaluate((el) => el.scrollTop);
    await links.getByRole("button", { name: "リンクを付ける" }).click();
    await expect(
      links.getByRole("link", { name: "受付の手順書" }),
    ).toHaveAttribute("href", "https://example.com/manual");
    // 保存でパネルを作り直しても、スクロールの位置は先頭に戻さない（#123）
    expect(before).toBeGreaterThan(0);
    expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(links).toContainText("マニュアル");

    await links.getByRole("button", { name: "＋ リンクを追加" }).click();
    await links.getByLabel("リンクの種類").selectOption({ label: "チケット" });
    await links.getByLabel("URL").fill("https://example.com/tickets/1");
    await links.getByRole("button", { name: "リンクを付ける" }).click();
    await links
      .getByRole("button", {
        name: "リンク「https://example.com/tickets/1」を外す",
      })
      .click();
    await expect(
      links.getByRole("link", { name: "https://example.com/tickets/1" }),
    ).toHaveCount(0);

    const snapshot = await (
      await page.request.get("/api/projects/local/snapshot")
    ).json();
    expect(
      snapshot.elements.find(
        (e: { name: string }) => e.name === "窓口で受け付ける",
      ).links,
    ).toEqual([
      expect.objectContaining({
        kind: "manual",
        url: "https://example.com/manual",
        label: "受付の手順書",
      }),
    ]);
  });
});
