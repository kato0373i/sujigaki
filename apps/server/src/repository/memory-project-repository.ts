import { fail, ok, type ProjectSettings, type Result } from "@sujigaki/domain";
import { normalizeDocument } from "@sujigaki/interchange";
import { applyChangeSet } from "./change-set.ts";
import type {
  ChangeSet,
  OperationRecord,
  ProjectRepository,
  StoredProject,
} from "./project-repository.ts";

interface Entry {
  stored: StoredProject;
  readonly operations: (OperationRecord & { readonly batchId: string })[];
}

/** メモリに置くリポジトリ。テストで使う。保存は同期的に行うため、同時に呼んでも順番に処理される */
export class MemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Entry>();

  async create(
    projectId: string,
    settings: ProjectSettings,
  ): Promise<Result<StoredProject>> {
    if (this.projects.has(projectId)) {
      return fail(
        "VALIDATION_FAILED",
        "同じ ID のプロジェクトがすでにあります。",
      );
    }
    const stored: StoredProject = {
      document: {
        project: settings,
        elements: [],
        questions: [],
        decisions: [],
        layouts: [],
      },
      revision: 0,
    };
    this.projects.set(projectId, { stored, operations: [] });
    return ok(stored);
  }

  async load(projectId: string): Promise<StoredProject | null> {
    return this.projects.get(projectId)?.stored ?? null;
  }

  async commit(
    projectId: string,
    changes: ChangeSet,
  ): Promise<Result<{ readonly revision: number }>> {
    const entry = this.projects.get(projectId);
    if (!entry) return fail("NOT_FOUND", "プロジェクトが見つかりません。");
    const applied = applyChangeSet(entry.stored.document, changes);
    if (!applied.ok) return applied;
    entry.operations.push(
      ...changes.operations.map((o) => ({ ...o, batchId: changes.batchId })),
    );
    entry.stored = {
      document: normalizeDocument(applied.value),
      revision: entry.operations.length,
    };
    return ok({ revision: entry.stored.revision });
  }

  /** 記録した操作。テストで確かめるために使う */
  operationsOf(
    projectId: string,
  ): readonly (OperationRecord & { batchId: string })[] {
    return this.projects.get(projectId)?.operations ?? [];
  }
}
