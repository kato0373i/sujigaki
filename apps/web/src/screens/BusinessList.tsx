import { type ElementSnapshot, REVIEW_STATES } from "@sujigaki/domain";
import { type FormEvent, useState } from "react";
import { addRelation, createElement } from "../api.ts";
import { ReviewStateMark } from "../components/status.tsx";
import type { BusinessRow } from "../model/business-list.ts";
import { hrefOf } from "../route.ts";

/**
 * S-03 業務一覧。業務ごとに業務フローと、確認状態ごとの要素の数を出す。
 * 編集者以上は、業務と業務フローを追加できる（FR-010）
 */
export function BusinessList({
  projectId,
  rows,
  canEdit,
  onChanged,
}: {
  projectId: string;
  rows: readonly BusinessRow[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  /** 作る操作をして、終わったら読み直す。失敗したら理由を出す */
  const attempt = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
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
        <p className="empty">まだ業務がありません。</p>
      ) : (
        <ul className="business-list">
          {rows.map((row) => (
            <li key={row.business?.id ?? "unassigned"} className="business-row">
              <div className="business-head">
                <h2>{row.business?.name ?? "業務に属さない業務フロー"}</h2>
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
    </section>
  );
}

/** 名前を入れて追加する欄。追加できたら空にする */
function AddForm({
  label,
  submit,
  onAdd,
  onCancel,
}: {
  label: string;
  submit: string;
  onAdd: (name: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;
    if (await onAdd(name.trim())) setName("");
  };
  return (
    <form className="add-form" onSubmit={add}>
      <input
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
