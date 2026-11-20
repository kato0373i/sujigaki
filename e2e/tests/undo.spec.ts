import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

const screenshots = "e2e/.work/screenshots";
const api = "/api/projects/local/elements";
const write = { "X-Sujigaki-Request": "1" };

interface Stored {
  id: string;
  name: string;
  version: number;
}

async function findElement(
  request: APIRequestContext,
  name: string,
): Promise<Stored> {
  const snapshot = await (
    await request.get("/api/projects/local/snapshot")
  ).json();
  return snapshot.elements.find((e: Stored) => e.name === name);
}

/** 後の E2E が数える要素を変えないよう、作った要素は完全に削除して片付ける */
async function purge(request: APIRequestContext, name: string) {
  const active = await findElement(request, name);
  if (active) {
    const deleted = await request.delete(`${api}/${active.id}`, {
      headers: { ...write, "If-Match": `"${active.version}"` },
    });
    expect(deleted.ok()).toBe(true);
  }
  const removed = (
    await (await request.get(`${api}?deleted=true`)).json()
  ).elements.find((e: Stored) => e.name === name) as Stored;
  const purged = await request.post(`${api}/${removed.id}/purge`, {
    headers: { ...write, "If-Match": `"${removed.version}"` },
  });
  expect(purged.status()).toBe(204);
}

async function openActivity(page: Page, name: string) {
  await page.goto("/#/elements/activity");
  await page.getByRole("button", { name, exact: true }).click();
  const panel = page.getByRole("complementary", { name: "要素の詳細" });
  await expect(panel.getByLabel("名前")).toHaveValue(name);
  return panel;
}

test.describe("FR-014 元に戻す", () => {
  test("外したつながりを、ヘッダーの「元に戻す」で戻す", async ({ page }) => {
    // 前の E2E が名前やつながりを変えるため、ID から今の名前と、つながりの先の登場人物を読む
    const snapshot = await (
      await page.request.get("/api/projects/local/snapshot")
    ).json();
    const byId = (id: string) =>
      snapshot.elements.find((e: Stored) => e.id === id) as Stored & {
        relations: { to: string; toKind: string }[];
      };
    const activity = byId("act-accept-cancel");
    const actorId = activity.relations.find((r) => r.toKind === "actor")?.to;
    const actor = byId(actorId as string).name;

    const panel = await openActivity(page, activity.name);
    const relations = panel
      .getByRole("region", { name: "つながり" })
      .locator(".relations");
    await expect(relations).toContainText(actor);
    await panel
      .getByRole("button", { name: `「${actor}」とのつながりを外す` })
      .click();
    await expect(relations).not.toContainText(actor);

    const undo = page.getByRole("button", { name: "元に戻す" });
    await expect(undo).toBeVisible();
    await expect(page.locator(".undo-label")).toHaveText(
      `「${activity.name}」のつながりの解除`,
    );
    await page.screenshot({ path: `${screenshots}/header-undo.png` });
    await undo.click();
    await expect(page.getByRole("status")).toHaveText(
      `「${activity.name}」のつながりの解除を元に戻しました。`,
    );
    await expect(relations).toContainText(actor);
  });

  test("作った要素は、Ctrl+Z で元に戻すと削除済みになる", async ({ page }) => {
    await page.goto("/#/elements/actor");
    await page.getByLabel("新しい登場人物の名前").fill("仮の担当");
    await page.getByRole("button", { name: "＋ 登場人物を追加" }).click();
    await expect(page.getByRole("button", { name: "仮の担当" })).toBeVisible();
    // 文字の入力欄にいるときの Ctrl+Z は欄の文字を戻すため、欄の外から押す
    await page.getByRole("heading", { name: "要素の一覧" }).click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByRole("status")).toHaveText(
      "「仮の担当」の追加を元に戻しました。",
    );
    await expect(page.getByRole("button", { name: "仮の担当" })).toHaveCount(0);
    await purge(page.request, "仮の担当");
  });

  test("AI の提案の反映を元に戻すと、追加した要素は削除済みになり、名前は元に戻る", async ({
    page,
  }) => {
    await page.goto("/#/ai");
    await page.getByRole("tab", { name: "提案を取り込む" }).click();
    await page
      .getByLabel("AI の返答")
      .fill(
        [
          "format: sujigaki-proposal",
          "version: 1",
          "elements:",
          "  - id: new-auditor",
          "    kind: actor",
          "    name: 監査担当",
          "  - id: actor-manager",
          "    kind: actor",
          "    name: 部長",
          "",
        ].join("\n"),
      );
    await page.getByRole("button", { name: "差分を見る" }).click();
    await page
      .getByRole("button", { name: "採用した変更を反映（2件）" })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "2件の変更を反映しました。",
    );
    await expect(page.locator(".undo-label")).toHaveText("2件の変更の反映");

    await page.getByRole("button", { name: "元に戻す" }).click();
    await expect(page.locator(".undo [role=status]")).toHaveText(
      "2件の変更の反映を元に戻しました。",
    );
    expect(await findElement(page.request, "監査担当")).toBeUndefined();
    expect((await findElement(page.request, "上長"))?.id).toBe("actor-manager");
    await purge(page.request, "監査担当");
  });

  test("操作のあとでほかの人が内容を変えた要素は、元に戻さない", async ({
    page,
  }) => {
    await page.goto("/#/elements/actor");
    await page.getByLabel("新しい登場人物の名前").fill("仮の担当");
    await page.getByRole("button", { name: "＋ 登場人物を追加" }).click();
    await expect(page.getByRole("button", { name: "仮の担当" })).toBeVisible();

    // ほかの人が要約を変えたことにする
    const created = await findElement(page.request, "仮の担当");
    const edited = await page.request.patch(`${api}/${created.id}`, {
      headers: { ...write, "If-Match": `"${created.version}"` },
      data: { summary: "ほかの人が書いた要約" },
    });
    expect(edited.ok()).toBe(true);

    await page.getByRole("button", { name: "元に戻す" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "「仮の担当」はこの操作のあとに変わったため、元に戻せません。",
    );
    await expect(page.getByRole("button", { name: "仮の担当" })).toBeVisible();
    await purge(page.request, "仮の担当");
  });
});
