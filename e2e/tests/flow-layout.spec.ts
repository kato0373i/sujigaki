import { expect, type Page, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

async function flowOf(page: Page, name: string) {
  const snapshot = await (
    await page.request.get("/api/projects/local/snapshot")
  ).json();
  return {
    snapshot,
    buc: snapshot.elements.find(
      (e: { kind: string; name: string }) =>
        e.kind === "buc" && e.name === name,
    ),
  };
}

/** カードの横の位置。重なっていれば同じ値が並ぶ */
async function cardLefts(page: Page) {
  const cards = page.getByTestId("activity-card");
  const count = await cards.count();
  const lefts: number[] = [];
  for (let i = 0; i < count; i++) {
    lefts.push(Math.round((await cards.nth(i).boundingBox())?.x ?? 0));
  }
  return lefts;
}

// 活動を足して配置を保存するため、順に動かす。要素を新しく作る E2E で作った業務フローを使う
test.describe.configure({ mode: "serial" });

test.describe("#111 業務フローでカードを重ねない", () => {
  test("流れの順のない活動を足しても重ならず、自動で並べ直すと配置を保存する", async ({
    page,
  }) => {
    const { buc } = await flowOf(page, "窓口受付");
    await page.goto(`/#/flows/${buc.id}`);
    const form = page.getByRole("form", { name: "活動を追加" });
    for (const name of ["受付票に書く", "受付番号を渡す"]) {
      await form.getByLabel("活動の名前").fill(name);
      await form.getByRole("button", { name: "＋ 活動を追加" }).click();
      await expect(
        page.getByTestId("activity-card").filter({ hasText: name }),
      ).toBeVisible();
    }
    await expect(page.getByTestId("activity-card")).toHaveCount(3);
    await expect.poll(async () => new Set(await cardLefts(page)).size).toBe(3);
    await page.screenshot({ path: `${screenshots}/s-04-layout.png` });

    await page.getByRole("button", { name: "自動で並べ直す" }).click();
    await expect
      .poll(async () => {
        const { snapshot } = await flowOf(page, "窓口受付");
        const layout = snapshot.layouts.find(
          (l: { bucId: string }) => l.bucId === buc.id,
        );
        return new Set(
          Object.values(layout?.positions ?? {}).map(
            (p) => (p as { x: number }).x,
          ),
        ).size;
      })
      .toBe(3);
  });
});
