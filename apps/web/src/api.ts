import type {
  DecisionSnapshot,
  ElementSnapshot,
  LayoutSnapshot,
  ProjectSettings,
  QuestionSnapshot,
} from "@sujigaki/domain";
import { updateLabel } from "./model/undo.ts";
import type { ChangesResponse } from "./model/update-notice.ts";
import { knownElement, recordChange } from "./undo-store.ts";

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

export async function updateElement(
  projectId: string,
  element: ElementSnapshot,
  version: number,
  changes: object,
): Promise<ElementSnapshot> {
  const after = await mutateElement(
    "PATCH",
    `/api/projects/${projectId}/elements/${element.id}`,
    version,
    changes,
  );
  recordChange(updateLabel(element, changes), [{ before: element, after }]);
  return after;
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

/**
 * 採用した取り込みの変更を、1つのトランザクションで反映する（FR-034、FR-050）。
 * 元に戻す操作（FR-014）から呼ぶときは、記録しないよう record を false にする
 */
export async function applyChangeSet(
  projectId: string,
  body: { readonly changes: readonly unknown[] },
  record = true,
): Promise<{ readonly elements: readonly ElementSnapshot[] }> {
  const result = await post<{ readonly elements: readonly ElementSnapshot[] }>(
    `/api/projects/${projectId}/change-sets`,
    body,
    "反映できませんでした。",
  );
  if (record)
    recordChange(
      `${body.changes.length}件の変更の反映`,
      result.elements.map((after) => ({
        before: knownElement(after.id),
        after,
      })),
    );
  return result;
}

/** 要素を作る（FR-010） */
export async function createElement(
  projectId: string,
  element: { kind: string; name: string; attributes?: Record<string, unknown> },
): Promise<ElementSnapshot> {
  const created = await post<ElementSnapshot>(
    `/api/projects/${projectId}/elements`,
    element,
    "要素を作れませんでした。",
  );
  recordChange(`「${created.name}」の追加`, [{ before: null, after: created }]);
  return created;
}

/** つながりを追加する。元の要素の読み込んだときのバージョンを付ける（FR-010） */
export async function addRelation(
  projectId: string,
  from: ElementSnapshot,
  to: string,
): Promise<ElementSnapshot> {
  const after = await mutateElement(
    "POST",
    `/api/projects/${projectId}/elements/${from.id}/relations`,
    from.version,
    { to },
  );
  recordChange(`「${from.name}」のつながりの追加`, [{ before: from, after }]);
  return after;
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
export async function removeRelation(
  projectId: string,
  owner: ElementSnapshot,
  relationId: string,
): Promise<ElementSnapshot> {
  const after = await mutateElement(
    "DELETE",
    `/api/projects/${projectId}/elements/${owner.id}/relations/${relationId}`,
    owner.version,
  );
  recordChange(`「${owner.name}」のつながりの解除`, [{ before: owner, after }]);
  return after;
}

/** 要素を削除する（FR-012）。論理削除のため、削除済みの要素の一覧から復元できる */
export async function deleteElement(
  projectId: string,
  element: ElementSnapshot,
): Promise<ElementSnapshot> {
  const after = await mutateElement(
    "DELETE",
    `/api/projects/${projectId}/elements/${element.id}`,
    element.version,
  );
  recordChange(`「${element.name}」の削除`, [{ before: element, after }]);
  return after;
}

/** 削除した要素を復元する。削除する前のつながりも戻る（FR-012） */
export async function restoreElement(
  projectId: string,
  element: ElementSnapshot,
): Promise<ElementSnapshot> {
  const after = await mutateElement(
    "POST",
    `/api/projects/${projectId}/elements/${element.id}/restore`,
    element.version,
  );
  recordChange(`「${element.name}」の復元`, [{ before: element, after }]);
  return after;
}

/** 削除済みの要素を完全に削除する。管理者だけが行え、元に戻せない（FR-012） */
export async function purgeElement(
  projectId: string,
  element: ElementSnapshot,
): Promise<void> {
  const response = await fetch(
    `/api/projects/${projectId}/elements/${element.id}/purge`,
    {
      method: "POST",
      headers: {
        "X-Sujigaki-Request": "1",
        "If-Match": `"${element.version}"`,
      },
    },
  );
  if (!response.ok)
    throw await problemOf(response, "完全に削除できませんでした。");
}

/** 削除済みの要素の一覧。削除した日時の新しい順に並ぶ（S-10） */
export async function fetchDeletedElements(
  projectId: string,
): Promise<readonly ElementSnapshot[]> {
  const response = await fetch(
    `/api/projects/${projectId}/elements?deleted=true`,
  );
  if (!response.ok)
    throw await problemOf(response, "削除済みの要素を読み込めませんでした。");
  return ((await response.json()) as { elements: ElementSnapshot[] }).elements;
}

/** プロジェクトの設定を変える。管理者だけが行える（FR-005、S-12） */
export async function updateProjectSettings(
  projectId: string,
  changes: Partial<ProjectSettings>,
): Promise<ProjectSettings> {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Sujigaki-Request": "1" },
    body: JSON.stringify(changes),
  });
  if (!response.ok)
    throw await problemOf(response, "設定を保存できませんでした。");
  return (await response.json()) as ProjectSettings;
}

/** 読み込んだリビジョンより後の操作を取り出す（FR-071） */
export async function fetchChanges(
  projectId: string,
  after: number,
): Promise<ChangesResponse> {
  const response = await fetch(
    `/api/projects/${projectId}/changes?after=${after}`,
  );
  if (!response.ok)
    throw await problemOf(response, "更新を確かめられませんでした。");
  return (await response.json()) as ChangesResponse;
}

/** 問いの回答を取り消す、解決にする、取り下げる（FR-031、要件定義書 7.2 節） */
export function changeQuestionState(
  projectId: string,
  questionId: string,
  action: "retract" | "resolve" | "withdraw",
): Promise<QuestionSnapshot> {
  return post(
    `/api/projects/${projectId}/questions/${questionId}/state`,
    { action },
    "問いの状態を変えられませんでした。",
  );
}

/** 決定を記録する。業務責任者以上が行える（FR-032） */
export function recordDecision(
  projectId: string,
  decision: {
    topic: string;
    conclusion: string;
    reason: string;
    questionId: string | null;
    elementIds: readonly string[];
  },
): Promise<DecisionSnapshot> {
  return post(
    `/api/projects/${projectId}/decisions`,
    decision,
    "決定を記録できませんでした。",
  );
}
