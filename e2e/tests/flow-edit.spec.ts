import { expect, type Page, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

interface Element {
  id: string;
  name: string;
  version: number;
  relations: { to: string; typeId: string }[];
}

async function snapshot(page: Page) {
  const response = await page.request.get("/api/projects/local/snapshot");
  return (await response.json()) as {
    elements: Element[];
    layouts: {
      bucId: string;
      positions: Record<string, { x: number; y: number }>;
    }[];
  };
}

async function element(page: Page, name: string): Promise<Element> {
  const found = (await snapshot(page)).elements.find((e) => e.name === name);
  if (!found) throw new Error(`${name} がない`);
  return found;
}

// 編集のテストはモデルを変えるため、順に動かす。ほかの E2E が確かめない「受講の取り消し」を使う
test.describe.configure({ mode: "serial" });

test.describe("S-04 業務フローを編集する", () => {
  test("FR-002 担当者のレーンを選んで活動を追加する", async ({ page }) => {
    await page.goto("/#/flows/buc-cancel");
    const form = page.getByRole("form", { name: "活動を追加" });
    await expect(form).toContainText("活動を分ける目安");
    await form.getByLabel("担当").selectOption({ label: "研修担当" });
    await form.getByLabel("活動の名前").fill("受講料を返す");
    await form.getByRole("button", { name: "＋ 活動を追加" }).click();

    const card = page
      .getByTestId("activity-card")
      .filter({ hasText: "受講料を返す" });
    await expect(card).toBeVisible();
    await page.screenshot({ path: `${screenshots}/s-04-add-activity.png` });

    const added = await element(page, "受講料を返す");
    expect(added.relations.map((r) => r.to)).toEqual(["actor-trainer"]);
    const flow = (await snapshot(page)).elements.find(
      (e) => e.id === "buc-cancel",
    );
    expect(flow?.relations.map((r) => r.to)).toContain(added.id);
  });

  test("FR-013 カードを横に動かすと図の配置を保存し、要素のバージョンは変えない", async ({
    page,
  }) => {
    await page.goto("/#/flows/buc-cancel");
    const before = await element(page, "取り消しを申し出る");
    const card = page
      .getByTestId("activity-card")
      .filter({ hasText: "取り消しを申し出る" });
    const box = await card.boundingBox();
    if (!box) throw new Error("カードが見えない");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 150,
      box.y + box.height / 2 + 80,
      {
        steps: 10,
      },
    );
    await page.mouse.up();

    await expect
      .poll(async () => {
        const layout = (await snapshot(page)).layouts.find(
          (l) => l.bucId === "buc-cancel",
        );
        return layout?.positions[before.id]?.x ?? 0;
      })
      .toBeGreaterThan(0);
    // 縦には動かず、担当者のレーンに残る。図を描き終えるまで待ってから比べる
    await page.reload();
    await expect
      .poll(async () => {
        const lane = await page
          .locator(".lane-name", { hasText: "受講者" })
          .boundingBox();
        const moved = await card.boundingBox();
        if (!lane || !moved) return false;
        const middle = moved.y + moved.height / 2;
        return middle > lane.y && middle < lane.y + lane.height;
      })
      .toBe(true);
    expect((await element(page, "取り消しを申し出る")).version).toBe(
      before.version,
    );
  });

  test("カードの端から別のカードへつなぐと、流れの順が増える", async ({
    page,
  }) => {
    await page.goto("/#/flows/buc-cancel");
    const from = await element(page, "取り消しを電話で受け付ける");
    const to = await element(page, "受講料を返す");
    const source = page.locator(
      `.react-flow__node[data-id="${from.id}"] .react-flow__handle.source`,
    );
    const target = page.locator(
      `.react-flow__node[data-id="${to.id}"] .react-flow__handle.target`,
    );
    await source.dragTo(target);

    await expect
      .poll(
        async () =>
          (await element(page, "取り消しを電話で受け付ける")).relations,
      )
      .toContainEqual(
        expect.objectContaining({ to: to.id, typeId: "activity-activity" }),
      );
  });
});
