import { useEffect, useRef, useState } from "react";
import { applyChangeSet, fetchDeletedElements, fetchSnapshot } from "../api.ts";
import { undoPlan } from "../model/undo.ts";
import { dropLatest, useLatestUndo, useUndoPushes } from "../undo-store.ts";

/** 文字を入れている欄にいるか。そのときの Ctrl+Z は欄の文字を戻すため、横取りしない */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/**
 * ヘッダーの「元に戻す」（FR-014、画面設計書 4章）。このタブで自分が行った直前の操作を元に戻す。
 * 操作のあとで内容が変わった要素があれば戻さず、理由を出す
 */
export function UndoControl({
  projectId,
  confirmFirst,
  onChanged,
}: {
  projectId: string;
  /** 詳細パネルに保存していない変更があれば、捨てるかを先に聞く */
  confirmFirst: (proceed: () => void) => void;
  onChanged: () => void;
}) {
  const latest = useLatestUndo();
  const pushes = useUndoPushes();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const undo = async () => {
    const entry = latest;
    if (!entry || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      // 画面に出している要素は古いことがあるため、今の要素を読み直して比べる
      const { elements } = await fetchSnapshot(projectId);
      const current = new Map(elements.map((e) => [e.id as string, e]));
      // 削除した要素は、削除済みの一覧から今のバージョンを取る
      if (entry.changes.some((c) => !current.has(c.after.id))) {
        for (const e of await fetchDeletedElements(projectId))
          current.set(e.id, e);
      }
      const plan = undoPlan(entry, current);
      if (!plan.ok) {
        // 今のままでは戻せないため、記録から外して、ひとつ前の操作を戻せるようにする
        dropLatest(entry);
        setMessage({ ok: false, text: plan.message });
        return;
      }
      await applyChangeSet(projectId, { changes: plan.changes }, false);
      dropLatest(entry);
      setMessage({ ok: true, text: `${entry.label}を元に戻しました。` });
    } catch (problem) {
      setMessage({ ok: false, text: (problem as Error).message });
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  // 新しい操作をしたら、前の結果の表示を消す
  // biome-ignore lint/correctness/useExhaustiveDependencies: 記録した回数が変わったときだけ消す
  useEffect(() => setMessage(null), [pushes]);

  // キーボードの操作からも、最新の undo を呼べるようにする
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const confirmRef = useRef(confirmFirst);
  confirmRef.current = confirmFirst;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z" &&
        !typing(event.target)
      ) {
        event.preventDefault();
        confirmRef.current(() => void undoRef.current());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!latest && !message) return null;
  return (
    <div className="undo">
      {latest && (
        <>
          <button
            type="button"
            disabled={busy}
            aria-describedby="undo-label"
            onClick={() => confirmFirst(() => void undo())}
          >
            元に戻す
          </button>
          <span id="undo-label" className="muted undo-label">
            {latest.label}
          </span>
        </>
      )}
      {message && (
        <span
          className={message.ok ? "success" : "error-inline"}
          role={message.ok ? "status" : "alert"}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
