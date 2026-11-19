import { describe, expect, it } from "vitest";
import { hrefOf, parseRoute } from "./route.ts";

describe("画面の場所", () => {
  it("URL の # のあとから画面を決め、同じ URL に戻せる", () => {
    for (const hash of ["#/", "#/board", "#/io", "#/flows/buc-1"]) {
      expect(hrefOf(parseRoute(hash))).toBe(hash);
    }
  });

  it("知らない場所は業務一覧にする", () => {
    expect(parseRoute("#/unknown")).toEqual({ screen: "businesses" });
    expect(parseRoute("")).toEqual({ screen: "businesses" });
  });
});
