import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

test.describe("FR-020 業務一覧から業務フローを開く", () => {
  test("業務一覧に、業務ごとの業務フローと確認状態の数が出る", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "業務一覧" })).toBeVisible();
    const training = page.locator(".business-row", { hasText: "研修" });
    await expect(
      training.getByRole("link", { name: "研修の受講申込" }),
    ).toBeVisible();
    await expect(
      training.getByRole("link", { name: "受講の取り消し" }),
    ).toBeVisible();
    await expect(
      page.locator(".business-row", { hasText: "請求" }),
    ).toContainText("業務フローがありません。");
    await page.screenshot({
      path: `${screenshots}/s-03-business-list.png`,
      fullPage: true,
    });
  });

  test("業務フローでは、担当者ごとのレーンに活動が並び、区分を色以外でも区別する", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("main")
      .getByRole("link", { name: "研修の受講申込" })
      .click();
    await expect(
      page.getByRole("heading", { name: "業務フロー: 研修の受講申込" }),
    ).toBeVisible();

    for (const lane of ["受講者", "上長", "研修担当", "担当者が未設定"]) {
      await expect(page.locator(".lane-name", { hasText: lane })).toBeVisible();
    }
    const cards = page.getByTestId("activity-card");
    await expect(cards).toHaveCount(4);
    const apply = cards.filter({ hasText: "研修に申し込む" });
    await expect(apply).toContainText("システム");
    await expect(apply).toContainText("受講を申し込む");
    await expect(apply).toContainText("情報 1");
    await expect(cards.filter({ hasText: "受講案内を送る" })).toContainText(
      "手作業",
    );
    await expect(
      cards
        .filter({ hasText: "申込を承認する" })
        .getByRole("img", { name: "確認済み" }),
    ).toBeVisible();
    // システム利用なのにシステム操作につながらない活動には、検証の違反を出す
    await expect(
      cards
        .filter({ hasText: "申込を承認する" })
        .getByRole("img", { name: /^検証の違反/ }),
    ).toBeVisible();
    await page.screenshot({ path: `${screenshots}/s-04-business-flow.png` });
  });

  test("NFR-017 業務一覧と業務フローに、アクセシビリティの違反がない", async ({
    page,
  }) => {
    for (const path of ["/", "/#/flows/buc-application"]) {
      await page.goto(path);
      await page.getByRole("heading", { level: 1 }).waitFor();
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    }
  });
});

test.describe("#144 #158 業務フローのレーン", () => {
  test("幅が狭く、詳細パネルを開いても、レーンの名前が見え、カードと重ならない", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/#/flows/buc-cancel");
    await page
      .getByTestId("activity-card")
      .filter({ hasText: "取り消しを申し出る" })
      .click();
    await expect(
      page.getByRole("complementary", { name: "要素の詳細" }),
    ).toBeVisible();
    const canvas = await page.locator(".flow-canvas").boundingBox();
    const label = page.locator(".lane-name").first();
    await expect(label).toBeVisible();
    await expect
      .poll(async () => {
        const box = await label.boundingBox();
        const cards = await page.getByTestId("activity-card").all();
        const lefts = await Promise.all(
          cards.map(async (c) => (await c.boundingBox())?.x ?? 0),
        );
        // 名前は枠の左端にあり、どのカードも名前より右にある
        return (
          box !== null &&
          canvas !== null &&
          Math.abs(box.x - canvas.x) < 4 &&
          lefts.every((x) => x >= box.x + box.width)
        );
      })
      .toBe(true);
  });

  test("担当者のいない活動がなければ、「担当者が未設定」のレーンを出さない", async ({
    page,
  }) => {
    await page.goto("/#/flows/buc-cancel");
    await expect(page.getByTestId("activity-card").first()).toBeVisible();
    await expect(
      page.locator(".lane-name", { hasText: "担当者が未設定" }),
    ).toHaveCount(0);
  });

  test("#161 図の操作ボタンは日本語で読み上げ、カードには種類と名前を付ける", async ({
    page,
  }) => {
    await page.goto("/#/flows/buc-cancel");
    for (const name of ["拡大", "縮小", "全体を表示"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    await expect(
      page.getByRole("group", { name: "活動「取り消しを受け付ける」" }),
    ).toBeVisible();
  });
});

test.describe("#162 ダークモード", () => {
  test("OS が暗い設定なら暗い色で出し、主な画面にアクセシビリティの違反がない", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/#/");
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(13, 17, 23)",
    );
    for (const hash of [
      "/#/",
      "/#/flows/buc-application",
      "/#/board",
      "/#/trace",
      "/#/elements/activity",
      "/#/chain/act-apply",
      "/#/ai",
      "/#/io",
      "/#/deleted",
      "/#/settings",
    ]) {
      await page.goto(hash);
      await expect(page.locator(".screen h1")).toBeVisible();
      const result = await new AxeBuilder({ page }).analyze();
      expect(
        result.violations.map((v) => `${hash} ${v.id}: ${v.help}`),
      ).toEqual([]);
    }
    await page.goto("/#/flows/buc-application");
    await page.screenshot({ path: `${screenshots}/dark-flow.png` });
  });
});

test.describe("#176 業務フローの凡例", () => {
  test("図の下に、カードの枠の種類と確認状態の印の意味を出す", async ({
    page,
  }) => {
    await page.goto("/#/flows/buc-application");
    const legend = page.getByRole("list", { name: "凡例" });
    for (const text of [
      "手作業",
      "システム",
      "区分が未設定",
      "未レビュー",
      "要確認",
      "要修正",
      "確認済み",
    ])
      await expect(legend).toContainText(text);
    const result = await new AxeBuilder({ page })
      .include(".flow-legend")
      .analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/s-04-legend.png` });
  });
});

test.describe("#174 業務フローのパンくず", () => {
  test("見出しの上に、業務一覧と業務の名前を出し、業務一覧へ戻れる", async ({
    page,
  }) => {
    await page.goto("/#/flows/buc-application");
    const crumbs = page.getByRole("navigation", { name: "パンくずリスト" });
    await expect(crumbs).toContainText("業務一覧");
    await expect(crumbs).toContainText("研修");
    await expect(crumbs.locator("[aria-current=page]")).toHaveText(
      "研修の受講申込",
    );
    await crumbs.getByRole("link", { name: "業務一覧" }).click();
    await expect(page.getByRole("heading", { name: "業務一覧" })).toBeVisible();
  });
});
