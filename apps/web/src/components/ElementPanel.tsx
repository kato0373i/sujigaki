import {
  type Actor,
  can,
  ELEMENT_KIND_LABELS,
  type ElementSnapshot,
  PERMISSIONS,
  REVIEW_STATE_LABELS,
  REVIEW_TRANSITIONS,
  ROLE_LABELS,
} from "@sujigaki/domain";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ApiProblem,
  changeReviewState,
  deleteElement,
  type Snapshot,
  updateElement,
} from "../api.ts";
import {
  ATTRIBUTE_FIELDS,
  type ContentChanges,
  changesOf,
  type Draft,
  draftOf,
  resetsReview,
} from "../model/element-editor.ts";
import { connectedElements } from "../model/relation-editor.ts";
import { stateModelOf } from "../model/state-diagram.ts";
import { hrefOf } from "../route.ts";
import { ActorPicker } from "./ActorPicker.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { ConflictDialog } from "./ConflictDialog.tsx";
import { DeliberationSection } from "./DeliberationSection.tsx";
import { ItemsTable } from "./ItemsTable.tsx";
import { LinksSection } from "./LinksSection.tsx";
import { PanelSection } from "./PanelSection.tsx";
import { RelationEditor } from "./RelationEditor.tsx";
import { ReviewStateMark } from "./status.tsx";

const AUTHOR_TAGS = { ai: "AI", import: "読み込み" } as const;

/**
 * 最後に開いていたパネルのスクロールの位置。保存のたびにパネルを作り直しても、
 * 同じ要素なら同じ位置に戻す（#123）
 */
let lastScroll: { id: string; top: number } | null = null;

/**
 * P-01 要素の詳細パネル。見出し・確認状態・内容・つながり・外部リンク・問いと決定記録を並べる。
 * ローカルモードにはコメントと変更履歴がないため、出さない
 */
export function ElementPanel({
  projectId,
  element,
  snapshot,
  actor,
  onChanged,
  onClose,
  onDirtyChange,
}: {
  projectId: string;
  element: ElementSnapshot;
  snapshot: Snapshot;
  actor: Actor;
  onChanged: () => void;
  onClose: () => void;
  /** 保存していない内容があるかを知らせる。再読み込みの前に確かめるために使う（FR-071） */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(element));
  // 状態の流れと状態では、その状態の流れの状態遷移図へのリンクを出す（#129）
  const stateModel = stateModelOf(element, snapshot.elements);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    changes: ContentChanges;
    current: ElementSnapshot;
  } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const changes = changesOf(element, draft);
  const canEdit = can(actor, "editElement");
  const panelRef = useRef<HTMLElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 作り直したときに1回だけ戻すため、依存を持たない
  useLayoutEffect(() => {
    if (panelRef.current && lastScroll?.id === element.id)
      panelRef.current.scrollTop = lastScroll.top;
  }, []);
  const dirty = changes !== null;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const save = async (version: number, content: ContentChanges) => {
    setError(null);
    try {
      await updateElement(projectId, element, version, content);
      setConflict(null);
      onChanged();
    } catch (problem) {
      if (
        problem instanceof ApiProblem &&
        problem.code === "VERSION_CONFLICT" &&
        problem.current
      ) {
        setConflict({
          changes: content,
          current: problem.current as ElementSnapshot,
        });
      } else {
        setError((problem as Error).message);
      }
    }
  };

  const transition = async (to: string) => {
    setError(null);
    try {
      await changeReviewState(projectId, element, to);
      onChanged();
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  const remove = async () => {
    setConfirmingDelete(false);
    setError(null);
    try {
      await deleteElement(projectId, element);
      onClose();
      onChanged();
    } catch (problem) {
      setError(
        problem instanceof ApiProblem && problem.code === "VERSION_CONFLICT"
          ? "ほかの人が先に更新したため、削除しませんでした。読み直してから、もう一度削除してください。"
          : (problem as Error).message,
      );
    }
  };

  const setAttribute = (key: string, value: string) =>
    setDraft({ ...draft, attributes: { ...draft.attributes, [key]: value } });
  const summaryLength = [...draft.summary].length;
  const summaryMax = snapshot.project.summaryMaxLength;

  return (
    <aside
      className="panel"
      aria-label="要素の詳細"
      ref={panelRef}
      onScroll={(e) => {
        lastScroll = { id: element.id, top: e.currentTarget.scrollTop };
      }}
    >
      <div className="panel-head">
        <span className="panel-kind">{ELEMENT_KIND_LABELS[element.kind]}</span>
        <button
          type="button"
          className="close"
          onClick={onClose}
          aria-label="詳細を閉じる"
        >
          ×
        </button>
      </div>
      <h2 className="panel-title">{element.name}</h2>
      <a
        className="chain-link"
        href={hrefOf({ screen: "chain", originId: element.id })}
      >
        連鎖ビューで開く
      </a>
      {stateModel && (
        <a
          className="chain-link"
          href={hrefOf({ screen: "states", modelId: stateModel })}
        >
          状態遷移図で開く
        </a>
      )}
      {element.authorType !== "human" && (
        <div className="panel-tags">
          <span className={`tag tag-${element.authorType}`}>
            {AUTHOR_TAGS[element.authorType]}
          </span>
        </div>
      )}
      {element.kind === "activity" && (
        // 担当者は活動の大事な項目なので、つながりより上で選び直せるようにする（#148）
        <ActorPicker
          projectId={projectId}
          element={element}
          elements={snapshot.elements}
          canEdit={canEdit}
          onChanged={onChanged}
          onError={setError}
        />
      )}

      {error && (
        <p className="error-inline" role="alert">
          {error}
        </p>
      )}

      <PanelSection id="review" title="確認状態">
        {/* 今の状態を大きく出し、次の状態へ進めるボタンは控えめにする（#179） */}
        <p className="review-current">
          <ReviewStateMark state={element.reviewState} />
        </p>
        <div className="review-actions">
          {REVIEW_TRANSITIONS.filter((t) => t.from === element.reviewState).map(
            (t) => {
              const allowed = can(actor, t.permission);
              const minimum = ROLE_LABELS[PERMISSIONS[t.permission]];
              return (
                <button
                  key={t.to}
                  type="button"
                  disabled={!allowed}
                  title={allowed ? undefined : `${minimum}以上が操作できます`}
                  onClick={() => transition(t.to)}
                >
                  「{REVIEW_STATE_LABELS[t.to]}」にする
                </button>
              );
            },
          )}
        </div>
      </PanelSection>

      <PanelSection id="content" title="内容">
        <label className="field">
          <span>名前</span>
          <input
            value={draft.name}
            disabled={!canEdit}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>
            要約
            <span className={summaryLength > summaryMax ? "over" : "muted"}>
              {" "}
              {summaryLength} / {summaryMax}字
            </span>
          </span>
          <textarea
            rows={3}
            value={draft.summary}
            disabled={!canEdit}
            onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
          />
        </label>
        {(ATTRIBUTE_FIELDS[element.kind] ?? []).map((f) => {
          const id = `attribute-${f.key}`;
          const value = draft.attributes[f.key] ?? "";
          return (
            <div key={f.key} className="field">
              <label htmlFor={id} id={`${id}-label`}>
                {f.label}
                {f.input === "lines" && (
                  <span className="muted">（1行に1つ）</span>
                )}
              </label>
              {f.input === "select" ? (
                <select
                  id={id}
                  value={value}
                  disabled={!canEdit}
                  onChange={(e) => setAttribute(f.key, e.target.value)}
                >
                  <option value="">未設定</option>
                  {f.choices?.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : f.input === "items" ? (
                <ItemsTable
                  id={id}
                  value={value}
                  disabled={!canEdit}
                  onChange={(next) => setAttribute(f.key, next)}
                />
              ) : f.input === "text" ? (
                <input
                  id={id}
                  value={value}
                  disabled={!canEdit}
                  onChange={(e) => setAttribute(f.key, e.target.value)}
                />
              ) : (
                <textarea
                  id={id}
                  rows={3}
                  value={value}
                  disabled={!canEdit}
                  onChange={(e) => setAttribute(f.key, e.target.value)}
                />
              )}
            </div>
          );
        })}
        <div className="save-row">
          {resetsReview(element, changes) && (
            <span className="notice" role="status">
              保存すると未レビューに戻ります
            </span>
          )}
          <button
            type="button"
            disabled={!canEdit || changes === null}
            onClick={() => changes && save(element.version, changes)}
          >
            保存
          </button>
        </div>
      </PanelSection>

      <RelationEditor
        projectId={projectId}
        element={element}
        elements={snapshot.elements}
        canEdit={canEdit}
        onChanged={onChanged}
        onError={setError}
      />

      <LinksSection
        projectId={projectId}
        element={element}
        canEdit={canEdit}
        onChanged={onChanged}
        onError={setError}
      />

      <DeliberationSection
        projectId={projectId}
        element={element}
        snapshot={snapshot}
        actor={actor}
        onChanged={onChanged}
        onError={setError}
      />

      {/* 削除の節はボタン1つなので畳まない */}
      <section aria-labelledby="delete-heading">
        <h3 id="delete-heading">削除</h3>
        <button
          type="button"
          className="delete-element"
          disabled={!canEdit}
          onClick={() => setConfirmingDelete(true)}
        >
          削除
        </button>
      </section>

      {confirmingDelete && (
        <DeleteConfirm
          element={element}
          elements={snapshot.elements}
          onConfirm={remove}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {conflict && (
        <ConflictDialog
          changes={conflict.changes}
          current={conflict.current}
          onOverwrite={() => save(conflict.current.version, conflict.changes)}
          onDiscard={() => {
            setConflict(null);
            onChanged();
          }}
        />
      )}
    </aside>
  );
}

/** D-02 削除の確認のダイアログ（FR-012）。削除するとつながりが表示から消える要素を出す */
function DeleteConfirm({
  element,
  elements,
  onConfirm,
  onCancel,
}: {
  element: ElementSnapshot;
  elements: readonly ElementSnapshot[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const connected = connectedElements(element, elements);
  return (
    <ConfirmDialog
      title={`「${element.name}」を削除しますか`}
      confirmLabel="削除する"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {connected.length === 0 ? (
        <p>つながっている要素はありません。</p>
      ) : (
        <>
          <p>
            次の{connected.length}
            件の要素とのつながりが、表示から消えます。削除済みの要素から復元すると、つながりも戻ります。
          </p>
          <ul className="plain">
            {connected.map((c) => (
              <li key={c.element.id}>
                <span className="muted">{c.kindLabel}</span> {c.element.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </ConfirmDialog>
  );
}
