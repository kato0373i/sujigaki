import { ELEMENT_KINDS, type ElementKind } from "@sujigaki/domain";
import { VIEW_PRESETS, type ViewPreset } from "./chain-view.ts";

/** 表示の設定（FR-022）。プリセットを選んだあとに、種類ごとに足し引きできる */
export interface ViewSettings {
  readonly preset: ViewPreset | "custom";
  readonly kinds: readonly ElementKind[];
  readonly depth: number;
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  preset: "flow",
  kinds: VIEW_PRESETS.flow.kinds,
  depth: 2,
};

const KEY = "sujigaki.view-settings";

/** ローカルモードでは、表示の設定をブラウザに記憶する（画面設計書 7章）。読めなければ既定に戻す */
export function loadViewSettings(
  storage: Pick<Storage, "getItem"> | undefined,
): ViewSettings {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return DEFAULT_VIEW_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ViewSettings>;
    const kinds = (parsed.kinds ?? []).filter((k): k is ElementKind =>
      (ELEMENT_KINDS as readonly string[]).includes(k),
    );
    const preset =
      parsed.preset === "custom" ||
      (parsed.preset && parsed.preset in VIEW_PRESETS)
        ? parsed.preset
        : DEFAULT_VIEW_SETTINGS.preset;
    const depth =
      typeof parsed.depth === "number" && parsed.depth >= 1 && parsed.depth <= 4
        ? parsed.depth
        : DEFAULT_VIEW_SETTINGS.depth;
    return {
      preset,
      kinds: kinds.length > 0 ? kinds : DEFAULT_VIEW_SETTINGS.kinds,
      depth,
    };
  } catch {
    return DEFAULT_VIEW_SETTINGS;
  }
}

export function saveViewSettings(
  storage: Pick<Storage, "setItem"> | undefined,
  settings: ViewSettings,
): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 記憶できなくても、表示は続ける
  }
}

export function choosePreset(
  settings: ViewSettings,
  preset: ViewPreset,
): ViewSettings {
  return { ...settings, preset, kinds: VIEW_PRESETS[preset].kinds };
}

/** 種類ごとのチェックで足し引きする。プリセットから外れたら「カスタム」にする */
export function toggleKind(
  settings: ViewSettings,
  kind: ElementKind,
): ViewSettings {
  const kinds = settings.kinds.includes(kind)
    ? settings.kinds.filter((k) => k !== kind)
    : ELEMENT_KINDS.filter((k) => k === kind || settings.kinds.includes(k));
  return { ...settings, preset: "custom", kinds };
}
