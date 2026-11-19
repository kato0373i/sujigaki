import type { ElementSnapshot } from "@sujigaki/domain";
import { useState } from "react";
import { searchElements } from "../model/element-search.ts";

/** ヘッダーの検索（FR-026、画面設計書 4章）。候補を選ぶと、その要素を開く */
export function SearchBox({
  elements,
  onSelect,
}: {
  elements: readonly ElementSnapshot[];
  onSelect: (elementId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const hits = searchElements(elements, query);
  const text = query.trim();

  return (
    <search className="search">
      <input
        type="search"
        aria-label="要素を検索"
        placeholder="要素を検索…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery("");
        }}
      />
      {text !== "" && (
        <div className="search-results">
          {hits.length === 0 ? (
            <p role="status">「{text}」に当てはまる要素はありません。</p>
          ) : (
            <ul aria-label="検索の結果">
              {hits.map((hit) => (
                <li key={hit.element.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      onSelect(hit.element.id);
                    }}
                  >
                    <span className="muted">{hit.kindLabel}</span>{" "}
                    {hit.element.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </search>
  );
}
