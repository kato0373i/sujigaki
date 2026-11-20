import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";
const headers = { "X-Sujigaki-Request": "1" };

// 削除と復元はモデルを変えるため、順に動かす。削除すると、その要素へつながる要素が未レビューに戻るため、ほかの要素からつながられていない要求を使う
test.describe.configure({ mode: "serial" });

test.describe("FR-012 要素を削除し、復元する", () => {
  test("削除の前に、つながりが切れる要素を出す。やめれば削除しない", async ({
    page,
  }) => {
    await page.goto("/#/chain/req-easy-apply");
    await page
      .getByTestId("chain-node")
      .filter({ hasText: "研修の申込をかんたんにしたい" })
      .click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    await panel.getByRole("button", { name: "削除" }).click();

    const dialog = page.getByRole("dialog", {
      name: "「研修の申込をかんたんにしたい」を削除しますか",
    });
    await expect(dialog).toContainText("業務 研修");
    const result = await new AxeBuilder({ page }).include(".confirm").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/s-10-delete-confirm.png` });

    await dialog.getByRole("button", { name: "やめる" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      panel.getByRole("heading", {
        name: "研修の申込をかんたんにしたい",
        level: 2,
      }),
    ).toBeVisible();
  });

  test("削除すると削除済みの要素に並び、復元するとつながりも戻る", async ({
    page,
  }) => {
    await page.goto("/#/chain/req-easy-apply");
    await page
      .getByTestId("chain-node")
      .filter({ hasText: "研修の申込をかんたんにしたい" })
      .click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    await panel.getByRole("button", { name: "削除" }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expect(panel).toHaveCount(0);

    await page
      .getByRole("link", { name: "削除済みの要素", exact: true })
      .click();
    const row = page.getByRole("row", { name: /研修の申込をかんたんにしたい/ });
    await expect(row).toContainText("要求");
    // ローカルモードには利用者がいないため、削除した人の列を出さない
    await expect(
      page.getByRole("columnheader", { name: "削除した人" }),
    ).toHaveCount(0);
    const result = await new AxeBuilder({ page }).include(".deleted").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/s-10-deleted-elements.png` });

    await row
      .getByRole("button", { name: "「研修の申込をかんたんにしたい」を復元" })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "「研修の申込をかんたんにしたい」を復元しました。",
    );
    await expect(page.getByText("削除済みの要素はありません。")).toBeVisible();
    const snapshot = await (
      await page.request.get("/api/projects/local/snapshot")
    ).json();
    expect(
      snapshot.elements.find((e: { id: string }) => e.id === "req-easy-apply"),
    ).toMatchObject({
      deletedAt: null,
      relations: [expect.objectContaining({ to: "biz-training" })],
    });
  });

  test("管理者は、確かめてから完全に削除できる", async ({ page }) => {
    const created = await (
      await page.request.post("/api/projects/local/elements", {
        headers,
        data: { kind: "actor", name: "完全に削除する担当" },
      })
    ).json();
    await page.request.delete(`/api/projects/local/elements/${created.id}`, {
      headers: { ...headers, "If-Match": '"1"' },
    });

    await page.goto("/#/deleted");
    await page
      .getByRole("button", { name: "「完全に削除する担当」を完全に削除" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "「完全に削除する担当」を完全に削除しますか",
    });
    await expect(dialog).toContainText("元に戻せません");
    await dialog.getByRole("button", { name: "完全に削除する" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "「完全に削除する担当」を完全に削除しました。",
    );
    const deleted = await (
      await page.request.get("/api/projects/local/elements?deleted=true")
    ).json();
    expect(deleted.elements).toEqual([]);
  });
});
