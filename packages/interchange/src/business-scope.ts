import { scopeElements } from "./ai-prompt.ts";
import type { ProjectDocument } from "./document.ts";

/** 業務の範囲に入る要素の ID。範囲は AI に渡す範囲（FR-033）と同じにする */
export function businessScopeIds(
  document: Pick<ProjectDocument, "elements">,
  businessId: string,
): Set<string> {
  return new Set(
    scopeElements(document.elements, { type: "business", id: businessId }).map(
      (e) => e.id as string,
    ),
  );
}

/**
 * 業務の範囲を切り出す（FR-050、設計書 5.5 節）。問いは範囲の要素のもの、決定記録は範囲の要素を含むもの、
 * 図の配置は範囲の業務フローのものを残す。範囲の外の要素へのつながりは残す
 */
export function businessScope(
  document: ProjectDocument,
  businessId: string,
): ProjectDocument {
  const ids = businessScopeIds(document, businessId);
  return {
    project: document.project,
    elements: document.elements.filter((e) => ids.has(e.id)),
    questions: document.questions.filter((q) => ids.has(q.elementId)),
    decisions: document.decisions.filter((d) =>
      d.elementIds.some((id) => ids.has(id)),
    ),
    layouts: document.layouts.filter((l) => ids.has(l.bucId)),
  };
}
