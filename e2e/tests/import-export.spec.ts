import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const screenshots = "e2e/.work/screenshots";

async function exportYaml(page: Page): Promise<string> {
  await page.goto("/#/io");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "YAML を書き出す" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("社内研修.sujigaki.yaml");
  return readFile((await file.path()) ?? "", "utf8");
}

async function choose(page: Page, name: string, text: string) {
  await page.getByLabel("読み込むファイル").setInputFiles({
    name,
    mimeType: "application/yaml",
    buffer: Buffer.from(text),
  });
}

// 取り込みはモデルを変えるため、順に動かす
test.describe.configure({ mode: "serial" });

test.describe("FR-050 YAML の読み込みと書き出し", () => {
  test("モデル全体を YAML に書き出す", async ({ page }) => {
    const yaml = await exportYaml(page);
    expect(yaml).toContain("format: sujigaki");
    expect(yaml).toContain("name: 研修に申し込む");
  });

  test("形式に合わないファイルは、行番号を付けて読み込まない", async ({
    page,
  }) => {
    await page.goto("/#/io");
    await choose(
      page,
      "broken.yaml",
      "format: sujigaki\nversion: 1\nproject:\n  name: 研修\n",
    );
    await expect(page.getByRole("alert")).toContainText(
      "ファイルの形式が正しくないため、読み込めません。",
    );
    await expect(page.getByRole("alert")).toContainText("4行目:");
  });

  test("書き出したファイルを直して読み込むと、差分を出して、採用した変更だけを反映する", async ({
    page,
  }) => {
    const yaml = await exportYaml(page);
    // ほかの E2E が確かめない要素だけを変える
    const edited = yaml
      .replace("name: 受講者\n", "name: 受講する人\n")
      .replace("name: 請求\n", "name: 請求の管理\n");
    await choose(page, "edited.yaml", edited);

    const rows = page.locator(".diff-row");
    await expect(rows).toHaveCount(2);
    const actor = rows.filter({ hasText: "受講する人" });
    await expect(actor).toContainText("変更");
    await expect(actor.getByRole("row", { name: /名前/ })).toContainText(
      "受講者",
    );
    const result = await new AxeBuilder({ page }).include(".io").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `${screenshots}/s-09-import-diff.png` });

    // 片方だけを採用する
    await rows
      .filter({ hasText: "請求の管理" })
      .getByRole("checkbox")
      .uncheck();
    await page
      .getByRole("button", { name: "採用した変更を反映（1件）" })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "1件の変更を反映しました。",
    );

    const snapshot = await (
      await page.request.get("/api/projects/local/snapshot")
    ).json();
    const names = snapshot.elements.map((e: { name: string }) => e.name);
    expect(names).toContain("受講する人");
    expect(names).toContain("請求");
  });

  test("今のモデルと違いがなければ、そのことを出す", async ({ page }) => {
    const yaml = await exportYaml(page);
    await choose(page, "same.yaml", yaml);
    await expect(
      page.getByText("今のモデルとの違いはありません。"),
    ).toBeVisible();
  });
});

test.describe("FR-051 RDRA の関連データの書き出し", () => {
  test("書き出す前に知らせることを出し、関連データをコピーとファイルで書き出す", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/#/io");
    const section = page.getByRole("region", {
      name: "RDRA の関連データの書き出し",
    });
    // 業務フローのない業務「請求」は、つながりがないため関連データに出てこない
    await expect(section).toContainText(
      "つながりがないため、関連データに出てこない要素",
    );
    await expect(section.getByRole("listitem")).toContainText(["業務 請求"]);
    const result = await new AxeBuilder({ page }).include(".io").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshots}/s-09-related-data.png` });

    await section.getByRole("button", { name: "関連データをコピー" }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const lines = copied.split("\n");
    expect(lines[0]).toBe("研修管理システム");
    expect(lines).toContain(
      "#child\t業務\tBUC\t研修@@研修の受講申込//研修@@受講の取り消し",
    );
    expect(copied).not.toContain("研修の申込をかんたんにしたい");

    const download = page.waitForEvent("download");
    await section.getByRole("button", { name: "ファイルに書き出す" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("社内研修.rdra.tsv");
    expect(await readFile((await file.path()) ?? "", "utf8")).toBe(copied);
  });
});

test.describe("FR-052 RDRA の関連データの読み込み", () => {
  async function exportRelated(page: Page): Promise<string> {
    await page.goto("/#/io");
    const download = page.waitForEvent("download");
    await page
      .getByRole("region", { name: "RDRA の関連データの書き出し" })
      .getByRole("button", { name: "ファイルに書き出す" })
      .click();
    return readFile((await (await download).path()) ?? "", "utf8");
  }

  test("種類と名前で今の要素と対応づけ、差分から採用した変更を反映する", async ({
    page,
  }) => {
    const text = await exportRelated(page);
    const section = page.getByRole("region", {
      name: "RDRA の関連データの読み込み",
    });
    await section.getByLabel("読み込む関連データ").setInputFiles({
      name: "training.rdra.tsv",
      mimeType: "text/tab-separated-values",
      buffer: Buffer.from(
        `${text}#comment\tアクター\t説明\t上長@@受講を承認する人\n`,
      ),
    });
    const rows = section.locator(".diff-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("上長");
    const result = await new AxeBuilder({ page }).include(".io").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshots}/s-09-related-import.png` });

    await section
      .getByRole("button", { name: "採用した変更を反映（1件）" })
      .click();
    await expect(section.getByRole("status")).toHaveText(
      "1件の変更を反映しました。",
    );
    const snapshot = await (
      await page.request.get("/api/projects/local/snapshot")
    ).json();
    expect(
      snapshot.elements.find((e: { id: string }) => e.id === "actor-manager"),
    ).toMatchObject({ summary: "受講を承認する人" });
  });

  test("名前の変更が疑われる要素は、対応づけてから名前の変更として取り込む", async ({
    page,
  }) => {
    const text = await exportRelated(page);
    const section = page.getByRole("region", {
      name: "RDRA の関連データの読み込み",
    });
    await section.getByLabel("読み込む関連データ").setInputFiles({
      name: "renamed.rdra.tsv",
      mimeType: "text/tab-separated-values",
      buffer: Buffer.from(text.replaceAll("受講案内の画面", "受講案内の表示")),
    });
    const choice = section.getByLabel("画面 受講案内の画面");
    await expect(choice.locator("option:checked")).toHaveText(
      "「受講案内の表示」に名前を変える（つながりが重なる）",
    );
    const result = await new AxeBuilder({ page }).include(".io").analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshots}/s-09-related-rename.png` });

    await section.getByRole("button", { name: "差分を出す" }).click();
    const rows = section.locator(".diff-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("受講案内の画面");
    await section
      .getByRole("button", { name: "採用した変更を反映（1件）" })
      .click();
    await expect(section.getByRole("status")).toHaveText(
      "1件の変更を反映しました。",
    );
    const snapshot = await (
      await page.request.get("/api/projects/local/snapshot")
    ).json();
    expect(
      snapshot.elements.find((e: { id: string }) => e.id === "screen-notice"),
    ).toMatchObject({ name: "受講案内の表示" });
  });

  test("形式に合わない関連データは、行番号を付けて読み込まない", async ({
    page,
  }) => {
    await page.goto("/#/io");
    const section = page.getByRole("region", {
      name: "RDRA の関連データの読み込み",
    });
    await section.getByLabel("読み込む関連データ").setInputFiles({
      name: "broken.tsv",
      mimeType: "text/tab-separated-values",
      buffer: Buffer.from("研修管理システム\n#edge\tアクティビティ\n"),
    });
    await expect(section.getByRole("alert")).toContainText(
      "2行目: 列の数が合いません。",
    );
  });
});
