import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

// 取り込みはモデルを変えるため、順に動かす。ほかの E2E が確かめる業務フローは変えない
test.describe.configure({ mode: "serial" });

test.describe("FR-033 AI に渡す", () => {
  test("範囲を選ばなければ、範囲を選ぶよう出す", async ({ page }) => {
    await page.goto("/#/ai");
    await expect(page.getByRole("status")).toHaveText(
      "AI に渡す範囲を選んでください。",
    );
  });

  test("業務を選んで、要素・規則・返答の形式の指示をクリップボードにコピーする", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/#/ai");
    await page.getByLabel("範囲").selectOption({ label: "研修" });
    await page.getByLabel("用途").selectOption({ label: "抜け漏れの指摘" });
    const text = page.getByLabel("AI に渡すテキスト");
    await expect(text).toHaveValue(/# 規則/);
    await expect(text).toHaveValue(/name: 研修に申し込む/);
    await expect(text).toHaveValue(/format: sujigaki-proposal/);
    const result = await new AxeBuilder({ page }).include(".io").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/s-08-ai-prompt.png` });

    await page.getByRole("button", { name: "コピー" }).click();
    await expect(
      page.getByRole("button", { name: "コピーしました" }),
    ).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("つながりや属性の抜け漏れを見つけてください");
  });
});

test.describe("#114 #127 AI に下書きを頼む", () => {
  test("プロジェクト全体を範囲にし、補足を書くと、補足とすべての種類の規則をテキストに入れる", async ({
    page,
  }) => {
    await page.goto("/#/ai");
    await page.getByLabel("範囲").selectOption({ label: "プロジェクト全体" });
    await page.getByLabel("用途").selectOption({ label: "下書きの作成" });
    await page
      .getByLabel("依頼の補足（任意）")
      .fill("研修の申込と取り消しを扱う業務です。");
    const text = page.getByLabel("AI に渡すテキスト");
    await expect(text).toHaveValue(
      /# 補足\n\n研修の申込と取り消しを扱う業務です。/,
    );
    await expect(text).toHaveValue(
      /- state-usecase: 状態 から システム操作 へ/,
    );
    await page.screenshot({ path: `${screenshots}/s-08-ai-project.png` });
  });
});

test.describe("FR-034 AI の提案を取り込む", () => {
  const reply = `こちらが提案です。

\`\`\`yaml
format: sujigaki-proposal
version: 1
elements:
  - id: new-accounting
    kind: actor
    name: 経理担当
questions:
  - elementId: act-request-cancel
    body: 取り消しはいつまで受け付けますか
    recommendation: 開講の3日前
  - elementId: new-accounting
    body: 経理の締め日はいつですか
\`\`\`
`;

  test("形式に合わない返答は、行番号を付けて取り込まない", async ({ page }) => {
    await page.goto("/#/ai");
    await page.getByRole("tab", { name: "提案を取り込む" }).click();
    await page
      .getByLabel("AI の返答")
      .fill(
        "format: sujigaki-proposal\nversion: 1\nelements:\n  - id: x\n    kind: robot\n    name: 何か\n",
      );
    await page.getByRole("button", { name: "差分を見る" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "返答の形式が正しくないため、取り込めません。",
    );
    await expect(page.getByRole("alert")).toContainText(
      "5行目: 要素の種類が正しくありません。",
    );
  });

  test("差分から要素を反映すると、作成者の種類が AI になる。提案された問いも保存できる", async ({
    page,
  }) => {
    await page.goto("/#/ai");
    await page.getByRole("tab", { name: "提案を取り込む" }).click();
    await page.getByLabel("AI の返答").fill(reply);
    await page.getByRole("button", { name: "差分を見る" }).click();
    await expect(
      page.locator(".diff-row", { hasText: "登場人物 経理担当" }),
    ).toContainText("追加");
    await expect(page.locator(".ai-questions")).toContainText(
      "取り消しはいつまで受け付けますか",
    );
    // 提案の中の新しい要素も ID でなく名前で出す（#116）
    await expect(page.locator(".ai-questions")).toContainText(
      "経理担当 経理の締め日はいつですか",
    );
    await expect(page.locator(".ai-questions")).not.toContainText(
      "new-accounting",
    );
    await page.screenshot({ path: `${screenshots}/s-08-ai-proposal.png` });

    await page
      .getByRole("button", { name: "採用した変更を反映（1件）" })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "1件の変更を反映しました。",
    );
    await page.getByRole("button", { name: "選んだ問いを保存（2件）" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "2件の問いを保存しました。",
    );

    const snapshot = await (
      await page.request.get("/api/projects/local/snapshot")
    ).json();
    const accounting = snapshot.elements.find(
      (e: { name: string }) => e.name === "経理担当",
    );
    expect(accounting).toMatchObject({
      authorType: "ai",
      source: "AI 提案",
      reviewState: "unreviewed",
    });
    // 仮の ID は取り込むときに付け替える（#110）
    expect(accounting.id).not.toMatch(/^new-/);
    expect(
      snapshot.questions.find(
        (q: { body: string }) => q.body === "取り消しはいつまで受け付けますか",
      ),
    ).toMatchObject({
      authorType: "ai",
      recommendation: "開講の3日前",
      elementId: "act-request-cancel",
    });
  });
});
