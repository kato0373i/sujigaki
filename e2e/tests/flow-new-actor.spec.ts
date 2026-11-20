import { expect, type Page, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

async function bucId(page: Page, name: string) {
  const snapshot = await (
    await page.request.get("/api/projects/local/snapshot")
  ).json();
  return snapshot.elements.find(
    (e: { kind: string; name: string }) => e.kind === "buc" && e.name === name,
  ).id;
}

// 活動と登場人物を作るため、順に動かす。要素を新しく作る E2E で作った業務フローを使う
test.describe.configure({ mode: "serial" });

test.describe("#118 #120 業務フローの担当者と問い", () => {
  test("「＋ 新しい担当者」を選ぶと、活動と一緒に担当者を作り、新しいレーンに置く", async ({
    page,
  }) => {
    await page.goto(`/#/flows/${await bucId(page, "窓口受付")}`);
    const form = page.getByRole("form", { name: "活動を追加" });
    await form.getByLabel("担当").selectOption({ label: "＋ 新しい担当者" });
    await form.getByLabel("新しい担当者の名前").fill("受付係");
    await form.getByLabel("活動の名前").fill("番号札を渡す");
    await page.screenshot({ path: `${screenshots}/s-04-new-actor.png` });
    await form.getByRole("button", { name: "＋ 活動を追加" }).click();

    await expect(
      page.locator(".lane-name", { hasText: "受付係" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("activity-card").filter({ hasText: "番号札を渡す" }),
    ).toBeVisible();
    await expect(form.getByLabel("担当")).toHaveValue("0");
  });

  test("未回答の問いがある活動のカードに、問いの数を出す", async ({ page }) => {
    await page.goto("/#/flows/buc-application");
    await expect(
      page
        .getByTestId("activity-card")
        .filter({ hasText: "研修に申し込む" })
        .locator(".badge-question"),
    ).toHaveText("問い 1");
  });
});
