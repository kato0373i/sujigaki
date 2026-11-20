import { type ElementSnapshot, REVIEW_STATES } from "@sujigaki/domain";
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
import type { BusinessRow } from "../model/business-list.ts";
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
  canEdit,
  onChanged,
}: {
  projectId: string;
  snapshot: Snapshot;
  rows: readonly BusinessRow[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ElementSnapshot | null>(null);

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
                  <span className="business-actions">
                    <button
                      type="button"
                      className="link"
                      aria-label={`業務「${row.business.name}」の名前を変える`}
                      onClick={() => setRenaming(row.business?.id ?? null)}
                    >
                      名前を変える
                    </button>
                    <button
                      type="button"
                      className="link danger"
                      aria-label={`業務「${row.business.name}」を削除`}
                      onClick={() => setRemoving(row.business)}
                    >
                      削除
                    </button>
                  </span>
                )}
                <ul className="counts" aria-label="確認状態ごとの要素の数">
                  {REVIEW_STATES.map((state) => (
                    <li key={state}>
                      <ReviewStateMark state={state} />
                      <span className="count">{row.counts[state]}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {row.flows.length === 0 ? (
                <p className="empty">業務フローがありません。</p>
              ) : (
                <ul className="flows">
                  {row.flows.map((flow) => (
                    <li key={flow.id}>
                      <a href={hrefOf({ screen: "flow", bucId: flow.id })}>
                        {flow.name}
                      </a>
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
    if (name.trim() === "") return;
    if (await onAdd(name.trim())) setName("");
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
