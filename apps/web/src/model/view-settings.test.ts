import { describe, expect, it } from "vitest";
import { VIEW_PRESETS } from "./chain-view.ts";
import {
  choosePreset,
  DEFAULT_VIEW_SETTINGS,
  loadViewSettings,
  saveViewSettings,
  toggleKind,
} from "./view-settings.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("FR-022 表示の設定", () => {
  it("既定はプリセット「業務の流れ」で、要求・業務・活動・システム操作を出す", () => {
    expect(loadViewSettings(memoryStorage())).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(DEFAULT_VIEW_SETTINGS.kinds).toEqual([
      "requirement",
      "business",
      "activity",
      "usecase",
    ]);
  });

  it("選んだ設定を記憶し、次に開いたときに戻す", () => {
    const storage = memoryStorage();
    const settings = choosePreset(DEFAULT_VIEW_SETTINGS, "screens");
    saveViewSettings(storage, settings);
    expect(loadViewSettings(storage)).toEqual({
      preset: "screens",
      kinds: VIEW_PRESETS.screens.kinds,
      depth: 2,
    });
  });

  it("種類を足し引きすると、カスタムになる", () => {
    const added = toggleKind(DEFAULT_VIEW_SETTINGS, "screen");
    expect(added).toMatchObject({ preset: "custom" });
    expect(added.kinds).toContain("screen");
    expect(toggleKind(added, "screen").kinds).not.toContain("screen");
  });

  it("壊れた内容や読めない保存先では、既定に戻す", () => {
    const broken = { getItem: () => "{" };
    expect(loadViewSettings(broken)).toEqual(DEFAULT_VIEW_SETTINGS);
    const throwing = {
      getItem: () => {
        throw new Error("使えない");
      },
    };
    expect(loadViewSettings(throwing)).toEqual(DEFAULT_VIEW_SETTINGS);
    const odd = {
      getItem: () =>
        JSON.stringify({ preset: "x", kinds: ["robot"], depth: 9 }),
    };
    expect(loadViewSettings(odd)).toEqual(DEFAULT_VIEW_SETTINGS);
  });
});
