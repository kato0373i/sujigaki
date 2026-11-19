import { describe, expect, it } from "vitest";
import { elementSnapshot, relationTo } from "../testing/index.ts";
import { contentHash } from "./content-hash.ts";

const actor = elementSnapshot("u1", "actor");
const screen = elementSnapshot("s1", "screen");
const base = elementSnapshot("a1", "activity", {
  name: "申込を確かめる",
  summary: "書類の不備を見る",
  attributes: { mode: "manual", trigger: "申込が届いたとき" },
  relations: [relationTo(actor, "activity")],
});

describe("FR-041 内容のハッシュ", () => {
  it("16進数14桁で、同じ内容なら同じ値になる", () => {
    expect(contentHash(base)).toMatch(/^[0-9a-f]{14}$/);
    expect(contentHash({ ...base })).toBe(contentHash(base));
  });

  it("属性のキーの順、つながりの順と ID、外部リンクは問わない", () => {
    const withTwo = {
      ...base,
      relations: [
        relationTo(actor, "activity"),
        relationTo(screen, "activity"),
      ],
    };
    const reordered = {
      ...withTwo,
      attributes: { trigger: "申込が届いたとき", mode: "manual" as const },
      relations: [...withTwo.relations]
        .reverse()
        .map((r, i) => ({ ...r, id: `x${i}` as typeof r.id })),
      links: [
        {
          id: "l1",
          kind: "document" as const,
          url: "https://example.com",
          label: null,
        },
      ],
    };
    expect(contentHash(reordered)).toBe(contentHash(withTwo));
  });

  it("名前・要約・属性・つながりのどれかが変われば、違う値になる", () => {
    const hash = contentHash(base);
    expect(contentHash({ ...base, name: "申込を確認する" })).not.toBe(hash);
    expect(contentHash({ ...base, summary: "" })).not.toBe(hash);
    expect(contentHash({ ...base, attributes: { mode: "system" } })).not.toBe(
      hash,
    );
    expect(contentHash({ ...base, relations: [] })).not.toBe(hash);
  });
});
