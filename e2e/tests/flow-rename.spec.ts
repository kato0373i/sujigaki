import { expect, type Page, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

async function activityNamed(page: Page, name: string) {
  const snapshot = await (
    await page.request.get("/api/projects/local/snapshot")
  ).json();
  return snapshot.elements.find(
    (e: { kind: string; name: string }) =>
      e.kind === "activity" && e.name === name,
  );
}

// 名前を変えるため、順に動かす。業務フローの編集の E2E で作った活動を使う
test.describe.configure({ mode: "serial" });

test.describe("US-001 カードの名前をその場で直す", () => {
  test("ダブルクリックで直し、Enter で保存する。Esc と空の名前では保存しない", async ({
    page,
  }) => {
    await page.goto("/#/flows/buc-cancel");
    await page.waitForLoadState("networkidle");
    const card = page
      .getByTestId("activity-card")
      .filter({ hasText: "受講料を返す" });
    const before = await activityNamed(page, "受講料を返す");

    // Esc ではやめる
    await card.getByText("受講料を返す").dblclick();
    const input = page.getByLabel("活動「受講料を返す」の名前");
    await input.fill("受講料を戻す");
    await input.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(card).toContainText("受講料を返す");

    // 空の名前は保存しない
    await card.getByText("受講料を返す").dblclick();
    await input.fill("  ");
    await input.press("Enter");
    await expect(card).toContainText("受講料を返す");

    await card.getByText("受講料を返す").dblclick();
    await input.fill("受講料を払い戻す");
    await page.screenshot({ path: `${screenshots}/s-04-rename.png` });
    await input.press("Enter");
    const renamed = page
      .getByTestId("activity-card")
      .filter({ hasText: "受講料を払い戻す" });
    await expect(renamed).toBeVisible();
    await expect
      .poll(async () => (await activityNamed(page, "受講料を払い戻す"))?.id)
      .toBe(before.id);
  });
});
