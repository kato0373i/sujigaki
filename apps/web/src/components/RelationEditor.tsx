import type { ElementSnapshot } from "@sujigaki/domain";
import { useState } from "react";
import { addRelation, removeRelation } from "../api.ts";
import { relationCandidates, relationRows } from "../model/relation-editor.ts";

/**
 * 詳細パネルのつながり（画面設計書 P-01）。つながりを外し、「＋ つなぐ」でつなげる種類の要素だけを探してつなぐ。
 * つながりは持つ側の要素に保存するため、相手の側で持つ組は相手の要素からつなぐ（設計書 ADR-004）
 */
export function RelationEditor({
  projectId,
  element,
  elements,
  canEdit,
  onChanged,
  onError,
}: {
  projectId: string;
  element: ElementSnapshot;
  elements: readonly ElementSnapshot[];
  canEdit: boolean;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const rows = relationRows(element, elements);
  const candidates = adding ? relationCandidates(element, elements, query) : [];

  const run = async (task: () => Promise<unknown>) => {
    onError(null);
    try {
      await task();
      setAdding(false);
      setQuery("");
      onChanged();
    } catch (problem) {
      onError((problem as Error).message);
    }
  };

  return (
    <section aria-labelledby="relations-heading">
      <h3 id="relations-heading">つながり</h3>
      {rows.length === 0 ? (
        <p className="muted">つながりはありません。</p>
      ) : (
        <ul className="plain relations">
          {rows.map((row) => (
            <li key={row.key}>
              <span>
                <span className="muted">{row.kindLabel}</span>{" "}
                {row.other?.name ?? "（見つからない要素）"}
              </span>
              {canEdit && (
                <button
                  type="button"
                  className="link danger"
                  aria-label={`「${row.other?.name ?? row.relationId}」とのつながりを外す`}
                  onClick={() =>
                    run(() =>
                      removeRelation(projectId, row.owner, row.relationId),
                    )
                  }
                >
                  外す
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit &&
        (adding ? (
          <div className="relation-search">
            <label htmlFor="relation-query">つなぐ要素を名前で探す</label>
            <input
              id="relation-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {candidates.length === 0 ? (
              <p className="muted">つなげる要素が見つかりません。</p>
            ) : (
              <ul className="plain" aria-label="つなげる要素">
                {candidates.map((c) => (
                  <li key={c.element.id}>
                    <button
                      type="button"
                      className="link"
                      onClick={() =>
                        run(() =>
                          c.reversed
                            ? addRelation(projectId, c.element, element.id)
                            : addRelation(projectId, element, c.element.id),
                        )
                      }
                    >
                      <span className="muted">{c.kindLabel}</span>{" "}
                      {c.element.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setAdding(false)}>
              やめる
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)}>
            ＋ つなぐ
          </button>
        ))}
    </section>
  );
}
