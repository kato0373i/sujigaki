import { describe, expect, it } from "vitest";
import { DEFAULT_PORT, parseCliArgs } from "./args.ts";

describe("CLI の引数", () => {
  it("フォルダーだけなら、既定のポートで起動する", () => {
    expect(parseCliArgs(["./model"])).toEqual({
      type: "start",
      folder: "./model",
      port: DEFAULT_PORT,
    });
  });

  it("ポートを指定できる", () => {
    expect(parseCliArgs(["./model", "--port", "5000"])).toMatchObject({
      port: 5000,
    });
    expect(parseCliArgs(["-p", "0", "./model"])).toMatchObject({ port: 0 });
  });

  it("説明を表示できる", () => {
    expect(parseCliArgs(["--help"])).toEqual({ type: "help" });
  });

  it("誤った引数は、理由を返す", () => {
    expect(parseCliArgs([])).toEqual({
      type: "error",
      message: "フォルダーを指定してください。",
    });
    expect(parseCliArgs(["a", "b"])).toEqual({
      type: "error",
      message: "フォルダーは1つだけ指定してください。",
    });
    expect(parseCliArgs(["a", "--port", "http"])).toEqual({
      type: "error",
      message: "ポートには0から65535までの整数を指定してください。",
    });
    expect(parseCliArgs(["a", "--color"]).type).toBe("error");
  });
});
