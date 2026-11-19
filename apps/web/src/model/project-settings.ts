import type { ProjectSettings } from "@sujigaki/domain";

/** S-12 の入力欄の値。数の欄も、入力したままの文字列で持つ */
export interface SettingsDraft {
  readonly name: string;
  readonly systemName: string;
  readonly summaryMaxLength: string;
}

export function settingsDraftOf(settings: ProjectSettings): SettingsDraft {
  return {
    name: settings.name,
    systemName: settings.systemName,
    summaryMaxLength: String(settings.summaryMaxLength),
  };
}

/**
 * 入力から、保存する変更を求める（FR-005）。変えた項目だけを返し、何も変えていなければ changes を null にする。
 * 要約の上限が1以上の整数でなければ、保存せずに理由を返す
 */
export function settingsChanges(
  current: ProjectSettings,
  draft: SettingsDraft,
): {
  readonly changes: Partial<ProjectSettings> | null;
  readonly error: string | null;
} {
  const text = draft.summaryMaxLength.trim();
  const max = Number(text);
  if (text === "" || !Number.isInteger(max) || max < 1) {
    return {
      changes: null,
      error: "要約の上限は1以上の整数にしてください。",
    };
  }
  const changes = {
    ...(draft.name !== current.name && { name: draft.name }),
    ...(draft.systemName !== current.systemName && {
      systemName: draft.systemName,
    }),
    ...(max !== current.summaryMaxLength && { summaryMaxLength: max }),
  };
  return {
    changes: Object.keys(changes).length > 0 ? changes : null,
    error: null,
  };
}
