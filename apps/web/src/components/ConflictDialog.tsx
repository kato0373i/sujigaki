import type { ElementSnapshot } from "@sujigaki/domain";
import { useEffect, useRef, useState } from "react";
import { type ContentChanges, conflictRows } from "../model/element-editor.ts";

/**
 * D-01 衝突のダイアログ（FR-070）。左に自分の変更、右に今の内容を並べ、違う項目を強調する
 */
export function ConflictDialog({
  changes,
  current,
  onOverwrite,
  onDiscard,
}: {
  changes: ContentChanges;
  current: ElementSnapshot;
  onOverwrite: () => void;
  onDiscard: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const rows = conflictRows(changes, current);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const copy = async () => {
    const text = rows.map((r) => `${r.label}: ${r.mine}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <dialog
      ref={dialog}
      className="conflict"
      aria-labelledby="conflict-title"
      onCancel={onDiscard}
    >
      <h2 id="conflict-title">ほかの人が先に更新しました</h2>
      <p>
        「{current.name}」はバージョン {current.version}{" "}
        に更新されています。残す内容を選んでください。
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">項目</th>
            <th scope="col">自分の変更</th>
            <th scope="col">今の内容</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={row.differs ? "differs" : undefined}>
              <th scope="row">
                {row.label}
                {row.differs && (
                  <span className="differs-text">（違いあり）</span>
                )}
              </th>
              <td>{row.mine}</td>
              <td>{row.current}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dialog-actions">
        <button type="button" onClick={copy}>
          {copied ? "コピーしました" : "自分の変更をコピー"}
        </button>
        <button type="button" onClick={onDiscard}>
          今の内容を使う（自分の変更を捨てる）
        </button>
        <button type="button" className="primary" onClick={onOverwrite}>
          自分の内容で上書き
        </button>
      </div>
    </dialog>
  );
}
