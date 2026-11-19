import { describe, expect, it } from "vitest";
import { settingsChanges, settingsDraftOf } from "./project-settings.ts";

const current = {
  name: "社内研修",
  systemName: "研修管理",
  summaryMaxLength: 100,
};

describe("S-12 プロジェクトの設定", () => {
  it("何も変えていなければ、保存する変更はない", () => {
    expect(settingsChanges(current, settingsDraftOf(current))).toEqual({
      changes: null,
      error: null,
    });
  });

  it("変えた項目だけを保存する", () => {
    const draft = { ...settingsDraftOf(current), summaryMaxLength: " 80 " };
    expect(settingsChanges(current, draft)).toEqual({
      changes: { summaryMaxLength: 80 },
      error: null,
    });
    expect(
      settingsChanges(current, { ...settingsDraftOf(current), name: "研修" })
        .changes,
    ).toEqual({ name: "研修" });
    expect(
      settingsChanges(current, {
        ...settingsDraftOf(current),
        systemName: "研修システム",
      }).changes,
    ).toEqual({ systemName: "研修システム" });
  });

  it.each(["", "0", "1.5", "abc"])(
    "要約の上限が「%s」なら、保存せずに理由を出す",
    (value) => {
      expect(
        settingsChanges(current, {
          ...settingsDraftOf(current),
          summaryMaxLength: value,
        }),
      ).toEqual({
        changes: null,
        error: "要約の上限は1以上の整数にしてください。",
      });
    },
  );
});
