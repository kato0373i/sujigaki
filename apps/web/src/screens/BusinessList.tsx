import {
  type ElementSnapshot,
  REVIEW_STATES,
  type ReviewState,
  type Violation,
} from "@sujigaki/domain";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  addRelation,
  createElement,
  deleteElement,
  type Snapshot,
  updateElement,
} from "../api.ts";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { ReviewStateMark } from "../components/status.tsx";
import { type BusinessRow, projectProgress } from "../model/business-list.ts";
import { connectedElements } from "../model/relation-editor.ts";
import { hrefOf } from "../route.ts";
import { undoable } from "../undo-store.ts";

/**
 * S-03 業務一覧。業務ごとに業務フローと、確認状態ごとの要素の数を出す。
 * 編集者以上は、業務と業務フローを追加し、業務の名前を変えたり削除したりできる（FR-010、#124）
 */
export function BusinessList({
  projectId,
  snapshot,
  rows,
  violations,
  canEdit,
  onChanged,
}: {
  projectId: string;
  snapshot: Snapshot;
  rows: readonly BusinessRow[];
  violations: readonly Violation[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ElementSnapshot | null>(null);
  const businesses = rows.flatMap((r) => (r.business ? [r.business] : []));

  /** 作る操作をして、終わったら読み直す。失敗したら理由を出す */
  const attempt = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      // 業務フローを作ってつなぐなど、1回の操作で行った変更をまとめて元に戻せるようにする（FR-014）
      await undoable(task);
      return true;
    } catch (problem) {
      setError((problem as Error).message);
      return false;
    } finally {
      onChanged();
    }
  };

  return (
    <section className="screen">
      <h1>業務一覧</h1>
      {rows.length > 0 && (
        <Overview snapshot={snapshot} violations={violations} />
      )}
      {canEdit && (
        <AddForm
          label="新しい業務の名前"
          submit="＋ 業務を追加"
          onAdd={(name) =>
            attempt(() => createElement(projectId, { kind: "business", name }))
          }
        />
      )}
      {error && (
        <p className="error-inline" role="alert">
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <StartGuide snapshot={snapshot} canEdit={canEdit} />
      ) : (
        <ul className="business-list">
          {rows.map((row) => (
            <li key={row.business?.id ?? "unassigned"} className="business-row">
              <div className="business-head">
                {row.business && renaming === row.business.id ? (
                  <AddForm
                    label={`業務「${row.business.name}」の新しい名前`}
                    submit="名前を変える"
                    initial={row.business.name}
                    onAdd={async (name) => {
                      const business = row.business as ElementSnapshot;
                      const ok = await attempt(() =>
                        updateElement(projectId, business, business.version, {
                          name,
                        }),
                      );
                      if (ok) setRenaming(null);
                      return ok;
                    }}
                    onCancel={() => setRenaming(null)}
                  />
                ) : (
                  <h2>{row.business?.name ?? "業務に属さない業務フロー"}</h2>
                )}
                {canEdit && row.business && renaming !== row.business.id && (
                  // 名前の変更と削除は、目立たないようにメニューにまとめる（#159）
                  <details className="row-menu">
                    <summary aria-label={`業務「${row.business.name}」の操作`}>
                      …
                    </summary>
                    <div className="row-menu-items">
                      <button
                        type="button"
                        aria-label={`業務「${row.business.name}」の名前を変える`}
                        onClick={(event) => {
                          closeMenu(event.currentTarget);
                          setRenaming(row.business?.id ?? null);
                        }}
                      >
                        名前を変える
                      </button>
                      <button
                        type="button"
                        className="danger"
                        aria-label={`業務「${row.business.name}」を削除`}
                        onClick={(event) => {
                          closeMenu(event.currentTarget);
                          setRemoving(row.business);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </details>
                )}
              </div>
              <ReviewProgress counts={row.counts} />
              {row.flows.length === 0 ? (
                <p className="empty">業務フローがありません。</p>
              ) : (
                <ul className="flows">
                  {row.flows.map((flow) => (
                    <li key={flow.id}>
                      <a href={hrefOf({ screen: "flow", bucId: flow.id })}>
                        {flow.name}
                      </a>
                      <span className="muted flow-size">
                        活動 {row.activities[flow.id] ?? 0}
                      </span>
                      {canEdit && !row.business && (
                        // 業務に属さない業務フローは、ここで業務に入れる（#149）
                        <select
                          className="assign-business"
                          aria-label={`業務フロー「${flow.name}」を入れる業務`}
                          value=""
                          onChange={(e) => {
                            const business = businesses.find(
                              (b) => b.id === e.target.value,
                            );
                            if (business)
                              void attempt(() =>
                                addRelation(projectId, business, flow.id),
                              );
                          }}
                        >
                          <option value="">業務に入れる…</option>
                          {businesses.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && row.business && (
                <AddFlow
                  business={row.business}
                  onAdd={(business, name) =>
                    attempt(async () => {
                      // 業務フローを作り、業務の子としてつなぐ
                      const flow = await createElement(projectId, {
                        kind: "buc",
                        name,
                      });
                      await addRelation(projectId, business, flow.id);
                    })
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {removing && (
        <ConfirmDialog
          title={`「${removing.name}」を削除しますか`}
          confirmLabel="削除する"
          onConfirm={() => {
            const target = removing;
            setRemoving(null);
            void attempt(() => deleteElement(projectId, target));
          }}
          onCancel={() => setRemoving(null)}
        >
          <RemovalNotice element={removing} elements={snapshot.elements} />
        </ConfirmDialog>
      )}
    </section>
  );
}

/** メニューの操作を選んだら、メニューを閉じる */
function closeMenu(button: HTMLElement) {
  const menu = button.closest("details");
  if (menu) menu.open = false;
}

/** 表示の順。確認済みを左に置き、進み具合として読めるようにする */
const PROGRESS_ORDER: readonly ReviewState[] = [
  "approved",
  "needs_check",
  "needs_fix",
  "unreviewed",
];

/**
 * プロジェクト全体の進み具合（#180）。確認の進み具合と、未回答の問い・直すものの数を出し、確認ボードへ案内する
 */
function Overview({
  snapshot,
  violations,
}: {
  snapshot: Snapshot;
  violations: readonly Violation[];
}) {
  const progress = projectProgress(
    snapshot.elements,
    snapshot.questions,
    violations,
  );
  return (
    <section className="overview" aria-label="全体の進み具合">
      <h2>全体の進み具合</h2>
      <ReviewProgress counts={progress.counts} />
      <ul className="plain overview-counts">
        <li>
          未回答の問い <strong>{progress.openQuestions}</strong> 件
        </li>
        <li>
          直すもの <strong>{progress.toFix}</strong> 件
        </li>
        <li>
          <a href={hrefOf({ screen: "board" })}>確認ボードで見る</a>
        </li>
      </ul>
    </section>
  );
}

/**
 * 確認の進み具合（#159）。確認状態ごとの割合を帯で示し、確認済みの数と、0でない確認状態の数を文字でも出す（NFR-017）
 */
function ReviewProgress({
  counts,
}: {
  counts: Readonly<Record<ReviewState, number>>;
}) {
  const total = REVIEW_STATES.reduce((sum, s) => sum + counts[s], 0);
  if (total === 0) return null;
  return (
    <div className="review-progress">
      <div className="progress-bar" aria-hidden="true">
        {PROGRESS_ORDER.filter((s) => counts[s] > 0).map((state) => (
          <span
            key={state}
            className={`progress-${state}`}
            style={{ width: `${(counts[state] / total) * 100}%` }}
          />
        ))}
      </div>
      <span className="progress-text">
        確認済み {counts.approved} / {total}
      </span>
      <ul className="counts" aria-label="確認状態ごとの要素の数">
        {PROGRESS_ORDER.filter((s) => s !== "approved" && counts[s] > 0).map(
          (state) => (
            <li key={state}>
              <ReviewStateMark state={state} />
              <span className="count">{counts[state]}</span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

/** 削除するとつながりが表示から消える要素（D-02 と同じ） */
function RemovalNotice({
  element,
  elements,
}: {
  element: ElementSnapshot;
  elements: readonly ElementSnapshot[];
}) {
  const connected = connectedElements(element, elements);
  if (connected.length === 0) return <p>つながっている要素はありません。</p>;
  return (
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
  );
}

/** 業務がない空のプロジェクトで出す、始め方（#117） */
function StartGuide({
  snapshot,
  canEdit,
}: {
  snapshot: Snapshot;
  canEdit: boolean;
}) {
  const { name, systemName } = snapshot.project;
  return (
    <div className="start-guide">
      <p>まだ業務がありません。次のどれかの方法で始めてください。</p>
      <ul>
        {canEdit && (
          <li>上の欄に業務の名前を入れて、「＋ 業務を追加」を押す</li>
        )}
        <li>
          <a href={hrefOf({ screen: "ai" })}>AI 連携</a>
          で、範囲を「プロジェクト全体」、用途を「下書きの作成」にして、AI
          に下書きを頼む
        </li>
        <li>
          <a href={hrefOf({ screen: "io" })}>読み込みと書き出し</a>
          で、YAML や RDRA の関連データを読み込む
        </li>
      </ul>
      <p className="muted">
        プロジェクトの名前は「{name}」、システム名は「{systemName}」です。
        <a href={hrefOf({ screen: "settings" })}>プロジェクトの設定</a>
        で変えられます。
      </p>
    </div>
  );
}

/** 名前を入れて追加する欄。追加できたら空にする */
function AddForm({
  label,
  submit,
  initial,
  onAdd,
  onCancel,
}: {
  label: string;
  submit: string;
  /** 欄の最初の値。名前を変えるときに今の名前を入れる */
  initial?: string;
  onAdd: (name: string) => Promise<boolean>;
  /** 押して開いた欄のときに渡す。開いたら入力にフォーカスを移す */
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial ?? "");
  // 追加しているあいだに送った名前は、前の追加が終わってから順に送る（#142）
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const input = useRef<HTMLInputElement>(null);
  // 押して開いた欄なら、開いたときに1回だけ入力にフォーカスを移す。
  // 名前を変えるときは、今の名前を選んで、すぐ打ち直せるようにする（#150）
  const opened = onCancel !== undefined;
  useEffect(() => {
    if (!opened) return;
    input.current?.focus();
    input.current?.select();
  }, [opened]);
  const add = async (event: FormEvent) => {
    event.preventDefault();
    const submitted = name.trim();
    if (submitted === "") return;
    // 送った名前はすぐ欄から消す。追加しているあいだに打った文字は残す（#142）
    setName("");
    const next = queue.current.then(async () => {
      if (!(await onAdd(submitted)))
        setName((current) => (current === "" ? submitted : current));
    });
    queue.current = next;
    await next;
  };
  return (
    <form className="add-form" onSubmit={add}>
      <input
        ref={input}
        aria-label={label}
        placeholder={label}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" disabled={name.trim() === ""}>
        {submit}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          やめる
        </button>
      )}
    </form>
  );
}

/** 業務ごとの「＋ 業務フローを追加」。押すと名前の欄を開く */
function AddFlow({
  business,
  onAdd,
}: {
  business: ElementSnapshot;
  onAdd: (business: ElementSnapshot, name: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        className="add-flow"
        aria-label={`業務「${business.name}」に業務フローを追加`}
        onClick={() => setOpen(true)}
      >
        ＋ 業務フローを追加
      </button>
    );
  }
  return (
    <AddForm
      label={`業務「${business.name}」の新しい業務フローの名前`}
      submit="追加"
      onAdd={async (name) => {
        const ok = await onAdd(business, name);
        if (ok) setOpen(false);
        return ok;
      }}
      onCancel={() => setOpen(false)}
    />
  );
}
