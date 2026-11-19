import type {
  DecisionSnapshot,
  ElementSnapshot,
  LayoutSnapshot,
  ProjectSettings,
  QuestionSnapshot,
} from "@sujigaki/domain";

/** スナップショットの API の応答（設計書 5.1 節） */
export interface Snapshot {
  readonly revision: number;
  readonly project: ProjectSettings;
  readonly elements: readonly ElementSnapshot[];
  readonly questions: readonly QuestionSnapshot[];
  readonly decisions: readonly DecisionSnapshot[];
  readonly layouts: readonly LayoutSnapshot[];
}

/** ローカルモードで扱う、ただ1つのプロジェクトの ID */
export const LOCAL_PROJECT_ID = "local";

export class ApiProblem extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(detail);
    this.code = code;
  }
}

export async function fetchSnapshot(projectId: string): Promise<Snapshot> {
  const response = await fetch(`/api/projects/${projectId}/snapshot`);
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as {
      code?: string;
      detail?: string;
    };
    throw new ApiProblem(
      problem.code ?? "INTERNAL",
      problem.detail ?? "プロジェクトを読み込めませんでした。",
    );
  }
  return (await response.json()) as Snapshot;
}
