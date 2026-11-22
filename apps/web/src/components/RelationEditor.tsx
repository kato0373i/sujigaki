import type { ElementSnapshot } from "@sujigaki/domain";
import { type ReactNode, useState } from "react";
import { addRelation, createElement, removeRelation } from "../api.ts";
import { useFocusFirst } from "../focus.ts";
import {
  creatableKinds,
  relationCandidates,
  relationRows,
} from "../model/relation-editor.ts";
import { undoable } from "../undo-store.ts";
import { PanelSection } from "./PanelSection.tsx";

/**
 * 詳細パネルのつながり（画面設計書 P-01）。つながりを外し、「＋ つなぐ」でつなげる種類の要素だけを探してつなぐ。
 * つながりは持つ側の要素に保存するため、相手の側で持つ組は相手の要素からつなぐ（設計書 ADR-004）。
 * 探した名前で新しい要素を作り、そのままつなぐこともできる（FR-010）
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
  // 種類の順に並んでいるので、続く同じ種類をまとめる
  const groups: { label: string; items: typeof rows }[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last?.label === row.kindLabel) last.items.push(row);
    else groups.push({ label: row.kindLabel, items: [row] });
  }
  const candidates = adding ? relationCandidates(element, elements, query) : [];
  const kinds = creatableKinds(element);
  const [kind, setKind] = useState(kinds[0]?.kind ?? "");
  const name = query.trim();
  const chosen = kinds.find((k) => k.kind === kind) ?? kinds[0];

  const run = async (task: () => Promise<unknown>) => {
    onError(null);
    try {
      // 要素を作ってつなぐ操作は、まとめて元に戻せるようにする（FR-014）
      await undoable(task);
      setAdding(false);
      setQuery("");
      onChanged();
    } catch (problem) {
      onError((problem as Error).message);
    }
  };

  return (
    <PanelSection
      id="relations"
      title="つながり"
      summary={rows.length > 0 ? `${rows.length}件` : undefined}
    >
      {rows.length === 0 ? (
        <p className="muted">つながりはありません。</p>
      ) : (
        // つながりは種類ごとにまとめ、種類ごとの件数を出す（#160）
        <ul className="plain relations">
          {groups.map(({ label, items }) => (
            <li key={label} className="relation-group">
              <div className="relation-group-head">
                {label}
                {/* 件数は2件以上の種類にだけ付ける（#178） */}
                {items.length > 1 && (
                  <span className="count">{items.length}</span>
                )}
              </div>
              <ul className="plain">
                {items.map((row) => (
                  <li key={row.key}>
                    <span>{row.other?.name ?? "（見つからない要素）"}</span>
                    {canEdit && (
                      <button
                        type="button"
                        className="link danger"
                        aria-label={`「${row.other?.name ?? row.relationId}」とのつながりを外す`}
                        onClick={() =>
                          run(() =>
                            removeRelation(
                              projectId,
                              row.owner,
                              row.relationId,
                            ),
                          )
                        }
                      >
                        外す
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {canEdit &&
        (adding ? (
          <RelationSearch>
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
            {name !== "" && chosen && (
              <div className="relation-create">
                <label htmlFor="relation-kind">新しく作る種類</label>
                <select
                  id="relation-kind"
                  value={chosen.kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  {kinds.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    run(async () => {
                      const created = await createElement(projectId, {
                        kind: chosen.kind,
                        name,
                      });
                      await (chosen.reversed
                        ? addRelation(projectId, created, element.id)
                        : addRelation(projectId, element, created.id));
                    })
                  }
                >
                  「{name}」を新しく作ってつなぐ
                </button>
              </div>
            )}
            <button type="button" onClick={() => setAdding(false)}>
              やめる
            </button>
          </RelationSearch>
        ) : (
          <button type="button" onClick={() => setAdding(true)}>
            ＋ つなぐ
          </button>
        ))}
    </PanelSection>
  );
}

/** 「＋ つなぐ」で開く検索の欄。開いたら検索の入力にフォーカスを移す */
function RelationSearch({ children }: { children: ReactNode }) {
  const ref = useFocusFirst<HTMLDivElement>();
  return (
    <div className="relation-search" ref={ref}>
      {children}
    </div>
  );
}
