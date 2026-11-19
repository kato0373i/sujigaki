import { describe, expect, it } from "vitest";
import * as domain from "./index.ts";

describe("@sujigaki/domain", () => {
  it("読み込める", () => {
    expect(domain).toBeDefined();
  });
});
