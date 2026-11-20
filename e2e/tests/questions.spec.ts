import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

async function questionsOf(
  page: import("@playwright/test").Page,
): Promise<{ body: string; state: string; answer: string | null }[]> {
  const snapshot = await (
    await page.request.get("/api/projects/local/snapshot")
  ).json();
  return snapshot.questions;
}

// 問いを付けて状態を変えるため、順に動かす。要素を新しく作る E2E で作った活動を使い、最後は未回答の問いを残さない
test.describe.configure({ mode: "serial" });

test.describe("FR-031 詳細パネルの問い", () => {
  test("問いを付け、回答・回答の取り消し・解決・取り下げをする", async ({
    page,
  }) => {
    await page.goto("/#/");
    await page
      .getByRole("searchbox", { name: "要素を検索" })
      .fill("窓口で受け付ける");
    await page.getByRole("button", { name: "活動 窓口で受け付ける" }).click();
    const panel = page.getByRole("complementary", { name: "要素の詳細" });

    await panel.getByRole("button", { name: "＋ 問いを追加" }).click();
    await panel
      .getByLabel("問い", { exact: true })
      .fill("受付の締め切りはいつですか");
    await panel.getByLabel("推奨案（任意）").fill("前日の17時");
    await panel.getByRole("button", { name: "問いを付ける" }).click();
    const question = panel.locator(".question", {
      hasText: "受付の締め切りはいつですか",
    });
    await expect(question).toContainText("問い（未回答）");
    await expect(question).toContainText("推奨案: 前日の17時");
    const result = await new AxeBuilder({ page }).include(".panel").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await question.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshots}/p-01-questions.png` });

    await question.getByRole("button", { name: "推奨案で回答" }).click();
    await expect(question).toContainText("問い（回答済み）");
    await expect(question).toContainText("回答: 前日の17時");
    await question.getByRole("button", { name: /の回答を取り消す$/ }).click();
    await expect(question).toContainText("問い（未回答）");

    await question.getByRole("button", { name: "回答する" }).click();
    await expect(question.getByRole("alert")).toHaveText(
      "回答を入力してください。",
    );
    await question
      .getByLabel("「受付の締め切りはいつですか」への回答")
      .fill("当日の正午");
    await question.getByRole("button", { name: "回答する" }).click();
    await expect(question).toContainText("回答: 当日の正午");
    await question.getByRole("button", { name: /を解決にする$/ }).click();
    await expect(question).toContainText("問い（解決）");

    await panel.getByRole("button", { name: "＋ 問いを追加" }).click();
    await panel
      .getByLabel("問い", { exact: true })
      .fill("電話でも受け付けますか");
    await panel.getByRole("button", { name: "問いを付ける" }).click();
    const second = panel.locator(".question", {
      hasText: "電話でも受け付けますか",
    });
    await second.getByRole("button", { name: /を取り下げる$/ }).click();
    await expect(second).toContainText("問い（取り下げ）");

    const saved = await questionsOf(page);
    expect(
      saved.find((q) => q.body === "受付の締め切りはいつですか"),
    ).toMatchObject({ state: "resolved", answer: "当日の正午" });
    expect(
      saved.find((q) => q.body === "電話でも受け付けますか"),
    ).toMatchObject({ state: "withdrawn" });
  });
});
