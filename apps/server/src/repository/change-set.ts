import {
  type ElementId,
  type ElementSnapshot,
  fail,
  ok,
  type Result,
} from "@sujigaki/domain";
import type { ProjectDocument } from "@sujigaki/interchange";
import type { ChangeSet } from "./project-repository.ts";

const conflict = (message: string) =>
  fail<ProjectDocument>("VERSION_CONFLICT", message);

/**
 * 変更の一式を、今の中身に当てる。バージョンが1件でも合わなければ、何も当てずに失敗を返す。
 * メモリとファイルの実装で使う。PostgreSQL の実装は、同じ検査をバージョンを条件にした UPDATE で行う
 */
export function applyChangeSet(
  document: ProjectDocument,
  changes: ChangeSet,
): Result<ProjectDocument> {
  const elements = new Map(document.elements.map((e) => [e.id, e]));
  for (const { value, expectedVersion } of changes.elements ?? []) {
    const current = elements.get(value.id);
    if (expectedVersion === null) {
      if (current) {
        return conflict(
          `要素「${value.name}」は、ほかの人が先に作っています。`,
        );
      }
    } else if (!current || current.version !== expectedVersion) {
      return conflict(staleMessage(current ?? value));
    }
    elements.set(value.id, value);
  }
  for (const { id, expectedVersion } of changes.purgedElements ?? []) {
    const current = elements.get(id);
    if (!current || current.version !== expectedVersion) {
      return conflict(
        current ? staleMessage(current) : `要素「${id}」がありません。`,
      );
    }
    elements.delete(id);
  }

  const layouts = new Map(document.layouts.map((l) => [l.bucId, l]));
  for (const { value, expectedVersion } of changes.layouts ?? []) {
    const currentVersion = layouts.get(value.bucId)?.version ?? 0;
    if (currentVersion !== expectedVersion) {
      return conflict("図の配置は、ほかの人が先に保存しました。");
    }
    layouts.set(value.bucId, value);
  }

  const questions = new Map(document.questions.map((q) => [q.id, q]));
  for (const question of changes.questions ?? []) {
    questions.set(question.id, question);
  }
  const decisions = new Map(document.decisions.map((d) => [d.id, d]));
  for (const decision of changes.decisions ?? []) {
    if (decisions.has(decision.id)) {
      return conflict("同じ ID の決定記録がすでにあります。");
    }
    decisions.set(decision.id, decision);
  }

  return ok({
    project: changes.project ?? document.project,
    elements: [...elements.values()],
    questions: [...questions.values()],
    decisions: [...decisions.values()],
    layouts: [...layouts.values()],
  });
}

function staleMessage(
  element: Pick<ElementSnapshot, "name"> & { id: ElementId },
) {
  return `要素「${element.name}」は、ほかの人が先に更新しました。最新の内容を読み込んでから保存してください。`;
}
