import type { ReactFlowInstance } from "@xyflow/react";

/** 図の文字が読める最小の倍率（#173） */
export const READABLE_ZOOM = 0.85;
/** 図全体を収めるときの倍率。小さな図は少し大きく描き、文字を読みやすくする（#156） */
export const FIT_OPTIONS = { maxZoom: 1.25, padding: 0.08 };
const MARGIN = 24;

/**
 * 図全体を枠に収める。収めると文字が読めないほど小さくなるときは、読める倍率のまま、
 * focusId の要素をなるべく真ん中に出す（図の端の外に余白を作らない範囲で）。focusId がなければ、図の左上（流れの始まり）を出す（#173）。
 * 全体を収めきれなかったら true を返す
 */
export async function fitReadable(
  flow: ReactFlowInstance,
  canvas: HTMLElement | null,
  focusId: string | null,
): Promise<boolean> {
  await flow.fitView(FIT_OPTIONS);
  if (!canvas || flow.getZoom() >= READABLE_ZOOM) return false;
  const zoom = READABLE_ZOOM;
  const bounds = flow.getNodesBounds(flow.getNodes());
  // 図の左端と上端は、枠の端から離しすぎない
  const left = MARGIN - bounds.x * zoom;
  const top = MARGIN - bounds.y * zoom;
  const focus = focusId ? flow.getNode(focusId) : undefined;
  if (focus) {
    const centerX = focus.position.x + (focus.measured?.width ?? 0) / 2;
    const centerY = focus.position.y + (focus.measured?.height ?? 0) / 2;
    await flow.setViewport({
      x: Math.min(left, canvas.clientWidth / 2 - centerX * zoom),
      y: Math.min(top, canvas.clientHeight / 2 - centerY * zoom),
      zoom,
    });
    return true;
  }
  await flow.setViewport({
    x: left,
    // 枠より低い図は縦の真ん中に、高い図は上端にそろえる
    y: Math.max(
      top,
      canvas.clientHeight / 2 - (bounds.y + bounds.height / 2) * zoom,
    ),
    zoom,
  });
  return true;
}
