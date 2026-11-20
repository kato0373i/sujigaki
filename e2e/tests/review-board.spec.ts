import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

// 回答のテストはモデルを変えるため、順に動かす
test.describe.configure({ mode: "serial" });

test.describe("FR-024 確認ボード", () => {
  test("管理者は「自分が確認するもの」で開き、要確認の要素と未回答の問いが業務ごとに並ぶ", async ({
    page,
  }) => {
    await page.goto("/#/board");
    await expect(
      page.getByRole("heading", { name: "確認ボード" }),
    ).toBeVisible();
    await expect(page.getByLabel("絞り込み")).toHaveValue("mine");
    const training = page.getByRole("region", { name: "研修" });
    await expect(
      training
        .locator(".board-column", { hasText: "要確認" })
        .getByRole("button", { name: "受講案内を送る" }),
    ).toBeVisible();
    await expect(training).toContainText("申込の締め切りはいつですか");
    // 空欄から計算した問いには「自動」のタグを付ける（FR-035）
    await expect(
      training
        .locator(".board-question-group", { hasText: "受講結果をまとめる" })
        .locator(".board-question")
        .first(),
    ).toContainText("自動");
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/s-06-review-board.png` });
  });

  test("FR-031 推奨案で回答すると、未回答の問いから消える", async ({
    page,
  }) => {
    await page.goto("/#/board");
    const question = page.locator(".board-question", {
      hasText: "申込の締め切りはいつですか",
    });
    await question
      .getByRole("button", { name: "推奨案で回答: 開講の2週間前" })
      .click();
    await expect(question).toHaveCount(0);
  });

  test("FR-035 空欄から計算した問いに回答すると、問いを保存して回答する", async ({
    page,
  }) => {
    await page.goto("/#/board");
    const question = page
      .locator(".board-question-group", { hasText: "受講結果をまとめる" })
      .locator(".board-question", { hasText: "担当者は誰ですか" });
    await question.getByLabel("「担当者は誰ですか」への回答").fill("研修担当");
    // Enter でも送れる（#115）
    await question.getByLabel("「担当者は誰ですか」への回答").press("Enter");
    await expect(question).toHaveCount(0);
    const snapshot = await (
      await page.request.get("/api/projects/local/snapshot")
    ).json();
    expect(
      snapshot.questions.find(
        (q: { elementId: string; body: string }) =>
          q.elementId === "act-report" && q.body === "担当者は誰ですか",
      ),
    ).toMatchObject({
      state: "answered",
      answer: "研修担当",
      authorType: "auto",
    });
  });

  test("「直すもの」に切り替えると、検証の違反が出る。要素を選ぶと詳細パネルを開く", async ({
    page,
  }) => {
    await page.goto("/#/board");
    await page.getByLabel("絞り込み").selectOption("fix");
    const training = page.getByRole("region", { name: "研修" });
    await expect(training).toContainText(
      "区分がシステム利用の活動ですが、システム操作につながっていません。",
    );
    await training
      .getByRole("button", { name: "申込を承認する" })
      .first()
      .click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });
    await expect(
      panel.getByRole("heading", { name: "申込を承認する", level: 2 }),
    ).toBeVisible();
  });
});
