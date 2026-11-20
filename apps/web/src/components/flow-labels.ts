import type { ElementSnapshot } from "@sujigaki/domain";
import { ELEMENT_KIND_LABELS } from "@sujigaki/domain";

/**
 * 図（業務フロー・連鎖ビュー・状態遷移図）の読み上げの文言。React Flow の既定は英語のため、日本語にする（#161）
 */
export const FLOW_ARIA_LABELS = {
  "node.a11yDescription.default":
    "Enter かスペースで選びます。Esc でやめます。",
  "node.a11yDescription.keyboardDisabled":
    "Enter かスペースで選びます。Esc でやめます。",
  "node.a11yDescription.ariaLiveMessage": ({
    direction,
    x,
    y,
  }: {
    direction: string;
    x: number;
    y: number;
  }) => `選んだ要素を${direction}へ動かしました。位置は x ${x}、y ${y} です。`,
  "edge.a11yDescription.default": "Enter かスペースで選びます。",
  "controls.ariaLabel": "図の操作",
  "controls.zoomIn.ariaLabel": "拡大",
  "controls.zoomOut.ariaLabel": "縮小",
  "controls.fitView.ariaLabel": "全体を表示",
  "controls.interactive.ariaLabel": "操作の切り替え",
  "minimap.ariaLabel": "全体図",
  "handle.ariaLabel": "つなぐ点",
};

/** 図のカードの読み上げ名。種類の表示名と名前を合わせる */
export function nodeLabel(element: ElementSnapshot): string {
  return `${ELEMENT_KIND_LABELS[element.kind]}「${element.name}」`;
}
