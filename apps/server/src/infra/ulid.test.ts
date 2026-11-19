import { describe, expect, it } from "vitest";
import { ulid } from "./ulid.ts";

describe("ULID", () => {
  it("26文字で、ID に使える文字だけからなる", () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("時刻の部分は、仕様の例と同じ値になる", () => {
    expect(ulid(1469918176385, (b) => b).slice(0, 10)).toBe("01ARYZ6S41");
  });

  it("あとで作ったものほど、文字列として後ろに並ぶ", () => {
    const zero = (b: Uint8Array) => b;
    expect(ulid(1000, zero) < ulid(2000, zero)).toBe(true);
  });
});
