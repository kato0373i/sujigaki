import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizeDocument } from "./document.ts";
import { readProjectYaml, writeProjectYaml } from "./project-yaml.ts";
import { documentArbitrary } from "./testing/arbitraries.ts";

describe("FR-050 NFR-015 YAML の読み書きの性質", () => {
  it("書き出して読み込むと、元のモデルに戻る", () => {
    fc.assert(
      fc.property(documentArbitrary, (document) => {
        const result = readProjectYaml(writeProjectYaml(document));
        if (!result.ok) throw new Error(JSON.stringify(result.issues));
        expect(result.document).toEqual(normalizeDocument(document));
      }),
    );
  });

  it("書き出した YAML を読み込んで書き出し直しても、同じ YAML になる", () => {
    fc.assert(
      fc.property(documentArbitrary, (document) => {
        const text = writeProjectYaml(document);
        const result = readProjectYaml(text);
        if (!result.ok) throw new Error(JSON.stringify(result.issues));
        expect(writeProjectYaml(result.document)).toBe(text);
      }),
    );
  });
});
