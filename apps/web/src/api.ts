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

/** API のエラー（設計書 5.2 節）。競合のときは current に今の内容が入る */
export class ApiProblem extends Error {
  readonly code: string;
  readonly current: unknown;

  constructor(code: string, detail: string, current?: unknown) {
    super(detail);
    this.code = code;
    this.current = current;
  }
}

async function problemOf(
  response: Response,
  fallback: string,
): Promise<ApiProblem> {
  const problem = (await response.json().catch(() => ({}))) as {
    code?: string;
    detail?: string;
    current?: unknown;
  };
  return new ApiProblem(
    problem.code ?? "INTERNAL",
    problem.detail ?? fallback,
    problem.current,
  );
}

/** 要素を変える API を呼ぶ。CSRF 対策のヘッダーと、読み込んだときのバージョンを付ける */
async function mutateElement(
  method: "PATCH" | "POST" | "DELETE",
  path: string,
  version: number,
  body?: unknown,
): Promise<ElementSnapshot> {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Sujigaki-Request": "1",
      "If-Match": `"${version}"`,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw await problemOf(response, "保存できませんでした。");
  return (await response.json()) as ElementSnapshot;
}

export function updateElement(
  projectId: string,
  element: ElementSnapshot,
  version: number,
  changes: unknown,
): Promise<ElementSnapshot> {
  return mutateElement(
    "PATCH",
    `/api/projects/${projectId}/elements/${element.id}`,
    version,
    changes,
  );
}

export function changeReviewState(
  projectId: string,
  element: ElementSnapshot,
  to: string,
): Promise<ElementSnapshot> {
  return mutateElement(
    "POST",
    `/api/projects/${projectId}/elements/${element.id}/review-state`,
    element.version,
    { to },
  );
}

export async function fetchSnapshot(projectId: string): Promise<Snapshot> {
  const response = await fetch(`/api/projects/${projectId}/snapshot`);
  if (!response.ok) {
    throw await problemOf(response, "プロジェクトを読み込めませんでした。");
  }
  return (await response.json()) as Snapshot;
}

/** 状態を変える API を呼ぶ。CSRF 対策のヘッダーを付ける */
async function post<T>(
  path: string,
  body: unknown,
  fallback: string,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sujigaki-Request": "1" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await problemOf(response, fallback);
  return (await response.json()) as T;
}

export function askQuestion(
  projectId: string,
  question: {
    elementId: string;
    body: string;
    authorType: "human" | "ai" | "auto";
    recommendation?: string | null;
  },
): Promise<QuestionSnapshot> {
  return post(
    `/api/projects/${projectId}/questions`,
    question,
    "問いを保存できませんでした。",
  );
}

/** 問いに回答する（FR-031）。推奨案を採用するときは answer を省く */
export function answerQuestion(
  projectId: string,
  questionId: string,
  answer: string | null,
): Promise<QuestionSnapshot> {
  return post(
    `/api/projects/${projectId}/questions/${questionId}/state`,
    answer === null
      ? { action: "acceptRecommendation" }
      : { action: "answer", answer },
    "回答を保存できませんでした。",
  );
}

/** 空のプロジェクトに YAML を復元する（FR-050） */
export function restoreProject(
  projectId: string,
  yaml: string,
): Promise<{ readonly elements: number }> {
  return post(
    `/api/projects/${projectId}/restore`,
    { yaml },
    "復元できませんでした。",
  );
}

/** 採用した取り込みの変更を、1つのトランザクションで反映する（FR-034、FR-050） */
export function applyChangeSet(
  projectId: string,
  body: unknown,
): Promise<{ readonly elements: readonly ElementSnapshot[] }> {
  return post(
    `/api/projects/${projectId}/change-sets`,
    body,
    "反映できませんでした。",
  );
}

/** 要素を作る（FR-010） */
export function createElement(
  projectId: string,
  element: { kind: string; name: string; attributes?: Record<string, unknown> },
): Promise<ElementSnapshot> {
  return post(
    `/api/projects/${projectId}/elements`,
    element,
    "要素を作れませんでした。",
  );
}

/** つながりを追加する。元の要素の読み込んだときのバージョンを付ける（FR-010） */
export function addRelation(
  projectId: string,
  from: ElementSnapshot,
  to: string,
): Promise<ElementSnapshot> {
  return mutateElement(
    "POST",
    `/api/projects/${projectId}/elements/${from.id}/relations`,
    from.version,
    { to },
  );
}

/** 図の配置を保存する（FR-020）。まだ保存していない配置のバージョンは 0 */
export async function saveLayout(
  projectId: string,
  bucId: string,
  version: number,
  positions: Record<string, { x: number; y: number }>,
): Promise<LayoutSnapshot> {
  const response = await fetch(`/api/projects/${projectId}/layouts/${bucId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Sujigaki-Request": "1",
      "If-Match": `"${version}"`,
    },
    body: JSON.stringify({ positions }),
  });
  if (!response.ok)
    throw await problemOf(response, "図の配置を保存できませんでした。");
  return (await response.json()) as LayoutSnapshot;
}

/** つながりを外す。つながりを持つ要素の、読み込んだときのバージョンを付ける（FR-010） */
export function removeRelation(
  projectId: string,
  owner: ElementSnapshot,
  relationId: string,
): Promise<ElementSnapshot> {
  return mutateElement(
    "DELETE",
    `/api/projects/${projectId}/elements/${owner.id}/relations/${relationId}`,
    owner.version,
  );
}

/** 要素を削除する（FR-012）。論理削除のため、削除済みの要素の一覧から復元できる */
export function deleteElement(
  projectId: string,
  element: ElementSnapshot,
): Promise<ElementSnapshot> {
  return mutateElement(
    "DELETE",
    `/api/projects/${projectId}/elements/${element.id}`,
    element.version,
  );
}

