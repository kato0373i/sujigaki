import type { ElementSnapshot } from "@sujigaki/domain";
import { useMemo, useState } from "react";
import {
  filterRows,
  TRACE_COLUMNS,
  type TraceCell,
  type TraceColumn,
  traceRows,
} from "../model/trace-table.ts";

/**
 * S-07 トレース表（FR-025）。1行を要求からシステム操作までの1本の経路にする。
 * 途切れているセルは、背景の色に加えて「なし」と文字で出す（NFR-017）
 */
export function TraceTable({
  elements,
  onSelect,
}: {
  elements: readonly ElementSnapshot[];
  onSelect: (elementId: string) => void;
}) {
  const [text, setText] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [sortBy, setSortBy] = useState<TraceColumn | null>(null);
  const all = useMemo(() => traceRows(elements), [elements]);
  const rows = filterRows(all, { text, gapsOnly, sortBy });

  return (
    <section className="screen">
      <h1>トレース表</h1>
      <div className="board-filters">
        <label>
          絞り込み{" "}
          <input value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={gapsOnly}
            onChange={(e) => setGapsOnly(e.target.checked)}
          />{" "}
          途切れている行だけ
        </label>
        <span className="muted">
          {rows.length} / {all.length}行
        </span>
      </div>
      <div className="trace-wrap">
        <table className="trace">
          <thead>
            <tr>
              {TRACE_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={sortBy === column.key ? "ascending" : "none"}
                >
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      setSortBy(sortBy === column.key ? null : column.key)
                    }
                  >
                    {column.label}
                    {sortBy === column.key && " ▲"}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key}>
                {TRACE_COLUMNS.map((column) => (
                  <Cell
                    key={column.key}
                    cell={row.cells[column.key]}
                    // 上の行と同じ要素は薄く出し、どこで区切れるかを読み取りやすくする（#155）
                    repeated={sameCell(
                      rows[index - 1]?.cells[column.key],
                      row.cells[column.key],
                    )}
                    onSelect={onSelect}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="empty">当てはまる行はありません。</p>
        )}
      </div>
    </section>
  );
}

/** 上の行のセルと同じ要素を出しているか。途切れや説明のセルは比べない */
function sameCell(above: TraceCell | undefined, cell: TraceCell): boolean {
  if (!above || cell.elements.length === 0) return false;
  return (
    above.elements.length === cell.elements.length &&
    above.elements.every((e, i) => e.id === cell.elements[i]?.id)
  );
}

function Cell({
  cell,
  repeated,
  onSelect,
}: {
  cell: TraceCell;
  repeated: boolean;
  onSelect: (elementId: string) => void;
}) {
  if (cell.gap) {
    return (
      <td className="gap">
        <span className="gap-text">なし</span>
      </td>
    );
  }
  if (cell.note) return <td className="muted">{cell.note}</td>;
  return (
    <td className={repeated ? "repeated" : undefined}>
      {cell.elements.map((element, index) => (
        <span key={element.id}>
          {index > 0 && "、"}
          <button
            type="button"
            className="link"
            onClick={() => onSelect(element.id)}
          >
            {element.name}
          </button>
        </span>
      ))}
    </td>
  );
}
