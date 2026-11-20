import {
  ELEMENT_KIND_LABELS,
  type ElementKind,
  type ElementSnapshot,
} from "@sujigaki/domain";
import { type FormEvent, useState } from "react";
import { createElement } from "../api.ts";
import { ReviewStateMark } from "../components/status.tsx";
import { kindCounts, kindListRows } from "../model/kind-list.ts";
import { hrefOf } from "../route.ts";

/**
 * S-13 要素の一覧（#128）。種類を1つ選び、その種類の要素を名前の順に出す。
 * 編集者以上は、選んだ種類の要素を名前だけで追加できる（FR-011）
 */
export function KindList({
  projectId,
  elements,
  kind,
  canEdit,
  onSelect,
  onChanged,
}: {
  projectId: string;
  elements: readonly ElementSnapshot[];
  kind: ElementKind;
  canEdit: boolean;
  onSelect: (elementId: string) => void;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const counts = kindCounts(elements);
  const total = counts.find((c) => c.kind === kind)?.count ?? 0;
  const rows = kindListRows(elements, kind, text);
  const label = ELEMENT_KIND_LABELS[kind];

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") return;
    setError(null);
    try {
      const created = await createElement(projectId, { kind, name: trimmed });
      setName("");
      onChanged();
      // 追加した要素の詳細パネルを開き、そこでつなげるようにする
      onSelect(created.id);
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  return (
    <section className="screen">
      <h1>要素の一覧</h1>
      <div className="kind-list">
        <ul className="kind-choices" aria-label="種類">
          {counts.map((c) => (
            <li key={c.kind}>
              <a
                href={hrefOf({ screen: "elements", kind: c.kind })}
                aria-current={c.kind === kind ? "page" : undefined}
                className={c.count === 0 ? "kind-empty" : undefined}
              >
                {c.label}
                <span className="count">{c.count}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="kind-body">
          <h2>{label}</h2>
          {(kind === "stateModel" || kind === "state") && (
            <p>
              <a href={hrefOf({ screen: "states", modelId: null })}>
                状態遷移図で見る
              </a>
            </p>
          )}
          {canEdit && (
            <form className="add-form" onSubmit={add}>
              <input
                aria-label={`新しい${label}の名前`}
                placeholder={`新しい${label}の名前`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" disabled={name.trim() === ""}>
                ＋ {label}を追加
              </button>
            </form>
          )}
          {error && (
            <p className="error-inline" role="alert">
              {error}
            </p>
          )}
          <div className="board-filters">
            <label>
              絞り込み{" "}
              <input value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            <span className="muted">
              {rows.length} / {total}件
            </span>
          </div>
          {total === 0 ? (
            <p className="empty">{label}の要素はありません。</p>
          ) : rows.length === 0 ? (
            <p className="empty">当てはまる要素はありません。</p>
          ) : (
            <div className="trace-wrap">
              <table className="trace">
                <thead>
                  <tr>
                    <th scope="col">名前</th>
                    <th scope="col">確認状態</th>
                    <th scope="col">要約</th>
                    <th scope="col">つながり</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ element, connections }) => (
                    <tr key={element.id}>
                      <td>
                        <button
                          type="button"
                          className="link"
                          onClick={() => onSelect(element.id)}
                        >
                          {element.name}
                        </button>
                      </td>
                      <td>
                        <ReviewStateMark state={element.reviewState} />
                      </td>
                      <td className="muted">{element.summary}</td>
                      <td className="kind-connections">{connections}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
