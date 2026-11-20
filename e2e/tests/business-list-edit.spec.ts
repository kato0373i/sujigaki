import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

// 業務を作って名前を変え、削除するため、順に動かす。ほかの E2E が使わない業務だけを扱う
test.describe.configure({ mode: "serial" });

test.describe("#124 業務一覧で名前を変え、削除する", () => {
  test("業務の名前を変え、確かめてから削除する", async ({ page }) => {
    await page.goto("/#/");
    await page.getByLabel("新しい業務の名前").fill("仮の業務");
    await page.getByRole("button", { name: "＋ 業務を追加" }).click();
    const row = page.locator(".business-row", { hasText: "仮の業務" });
    await expect(row).toBeVisible();

    // 名前の変更と削除は、カードのメニューから選ぶ（#159）
    await row.getByLabel("業務「仮の業務」の操作").click();
    await row
      .getByRole("button", { name: "業務「仮の業務」の名前を変える" })
      .click();
    // 名前の欄を開くと見出しが欄に替わるため、欄は画面全体から探す
    const name = page.getByLabel("業務「仮の業務」の新しい名前");
    await expect(name).toHaveValue("仮の業務");
    // 今の名前を選んだ状態で開くため、そのまま打つと置き換わる（#150）
    await expect(name).toBeFocused();
    await name.pressSequentially("試しの業務");
    await name.press("Enter");
    const renamed = page.locator(".business-row", { hasText: "試しの業務" });
    await expect(
      renamed.getByRole("heading", { name: "試しの業務" }),
    ).toBeVisible();
    await renamed.getByLabel("業務「試しの業務」の操作").click();
    await page.screenshot({ path: `${screenshots}/s-03-edit.png` });
    await renamed
      .getByRole("button", { name: "業務「試しの業務」を削除" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "「試しの業務」を削除しますか",
    });
    await expect(dialog).toContainText("つながっている要素はありません。");
    await dialog.getByRole("button", { name: "削除する" }).click();
    await expect(renamed).toHaveCount(0);

    // 後の E2E が削除済みの一覧を確かめるため、作った業務は完全に削除して片付ける
    const deleted = await (
      await page.request.get("/api/projects/local/elements?deleted=true")
    ).json();
    const target = deleted.elements.find(
      (e: { name: string }) => e.name === "試しの業務",
    );
    const purged = await page.request.post(
      `/api/projects/local/elements/${target.id}/purge`,
      {
        headers: {
          "X-Sujigaki-Request": "1",
          "If-Match": `"${target.version}"`,
        },
      },
    );
    expect(purged.status()).toBe(204);
  });

  test("#142 続けて追加しても、追加しているあいだに打った名前は消えない", async ({
    page,
  }) => {
    await page.goto("/#/");
    const input = page.getByLabel("新しい業務の名前");
    await input.fill("続けて足す業務1");
    await input.press("Enter");
    // 追加が終わるのを待たずに、次の名前を打って送る
    await input.pressSequentially("続けて足す業務2");
    await expect(input).toHaveValue("続けて足す業務2");
    await input.press("Enter");
    for (const name of ["続けて足す業務1", "続けて足す業務2"]) {
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    }
    await expect(input).toHaveValue("");

    // 後の E2E が業務の数を変えないよう、作った業務は完全に削除して片付ける
    const headers = (version: number) => ({
      "X-Sujigaki-Request": "1",
      "If-Match": `"${version}"`,
    });
    const snapshot = await (
      await page.request.get("/api/projects/local/snapshot")
    ).json();
    const created = snapshot.elements.filter((e: { name: string }) =>
      e.name.startsWith("続けて足す業務"),
    );
    expect(created).toHaveLength(2);
    for (const e of created) {
      const deleted = await page.request.delete(
        `/api/projects/local/elements/${e.id}`,
        { headers: headers(e.version) },
      );
      const after = await deleted.json();
      const purged = await page.request.post(
        `/api/projects/local/elements/${e.id}/purge`,
        { headers: headers(after.version) },
      );
      expect(purged.status()).toBe(204);
    }
  });

  test("連鎖ビューの起点が見つからないときは、戻る先を出す", async ({
    page,
  }) => {
    await page.goto("/#/chain/no-such-element");
    await expect(page.getByRole("alert")).toHaveText(
      "起点の要素が見つかりません。削除された可能性があります。",
    );
    await page.getByRole("link", { name: "削除済みの要素を見る" }).click();
    await expect(page).toHaveURL(/#\/deleted$/);
  });
});
