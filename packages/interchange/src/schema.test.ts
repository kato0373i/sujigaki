import { describe, expect, it } from "vitest";
import { projectJsonSchema } from "./schema.ts";

describe("FR-050 公開する JSON Schema", () => {
  it("リポジトリに置いた JSON Schema が、YAML の形式の定義と一致する", async () => {
    // 形式を変えたら `npx vitest run -u` でファイルを作り直す
    await expect(
      `${JSON.stringify(projectJsonSchema(), null, 2)}\n`,
    ).toMatchFileSnapshot("../schema/project.schema.json");
  });

  it("要素は種類ごとに、持てる属性を決めている", () => {
    const schema = projectJsonSchema() as {
      properties: { elements: { items: { oneOf: unknown[] } } };
    };
    expect(schema.properties.elements.items.oneOf).toHaveLength(18);
  });
});
