import type { ElementSnapshot } from "@sujigaki/domain";
import type { ImportDiff } from "@sujigaki/interchange";
import { useState } from "react";
import { CHANGE_TYPE_LABELS, changeRows } from "../model/import-review.ts";

/**
 * 取り込みの差分（画面設計書 S-08、S-09）。追加・変更・削除を1件ずつ出し、要素ごとに採否を決める。
 * 変更は項目ごとに今の内容と取り込む内容を並べる
 */
export function ImportDiffView({
  diff,
  known,
  busy,
  onApply,
}: {
  diff: ImportDiff;
  known: readonly ElementSnapshot[];
  busy: boolean;
  onApply: (adopted: ImportDiff["changes"]) => void;
}) {
  const rows = changeRows(diff.changes, known);
  const [rejected, setRejected] = useState<ReadonlySet<string>>(new Set());
  const adopted = rows.filter((r) => !rejected.has(r.key));
  const toggle = (key: string) => {
    const next = new Set(rejected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setRejected(next);
  };

  return (
    <div className="diff">
      {diff.problems.length > 0 && (
        <div className="problems" role="alert">
          <p>次の要素は取り込めません。</p>
          <ul>
            {diff.problems.map((p) => (
              <li key={p.elementId}>{p.message}</li>
            ))}
          </ul>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="empty">今のモデルとの違いはありません。</p>
      ) : (
        <ul className="plain diff-rows">
          {rows.map((row) => {
            const id = `adopt-${row.key}`;
            return (
              <li key={row.key} className={`diff-row diff-${row.change.type}`}>
                <div className="diff-head">
                  <input
                    id={id}
                    type="checkbox"
                    checked={!rejected.has(row.key)}
                    onChange={() => toggle(row.key)}
                  />
                  <label htmlFor={id}>
                    <span className="tag">
                      {CHANGE_TYPE_LABELS[row.change.type]}
                    </span>{" "}
                    <span className="muted">{row.kindLabel}</span> {row.name}
                  </label>
                </div>
                {row.differences.length > 0 && (
                  <table className="diff-table">
                    <thead>
                      <tr>
                        <th scope="col">項目</th>
                        <th scope="col">今の内容</th>
                        <th scope="col">取り込む内容</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.differences.map((d) => (
                        <tr key={d.label}>
                          <th scope="row">{d.label}</th>
                          <td>{d.before}</td>
                          <td>{d.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && (
        <button
          type="button"
          className="primary"
          disabled={busy || adopted.length === 0}
          onClick={() => onApply(adopted.map((r) => r.change))}
        >
          採用した変更を反映（{adopted.length}件）
        </button>
      )}
    </div>
  );
}
