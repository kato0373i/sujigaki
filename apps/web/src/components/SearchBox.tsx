import type { ElementSnapshot } from "@sujigaki/domain";
import { type KeyboardEvent, useRef, useState } from "react";
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
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  /** ↑↓キーで候補のあいだを動く。Enter は候補のボタンが受ける（#125） */
  const move = (event: KeyboardEvent, from: number) => {
    const buttons = [
      ...(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = from + (event.key === "ArrowDown" ? 1 : -1);
      if (next < 0) input.current?.focus();
      else buttons[Math.min(next, buttons.length - 1)]?.focus();
    } else if (event.key === "Escape") {
      setQuery("");
      input.current?.focus();
    }
  };

  return (
    <search className="search">
      <input
        type="search"
        aria-label="要素を検索"
        placeholder="要素を検索…"
        ref={input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => move(e, -1)}
      />
      {text !== "" && (
        <div className="search-results">
          {hits.length === 0 ? (
            <p role="status">「{text}」に当てはまる要素はありません。</p>
          ) : (
            <ul aria-label="検索の結果" ref={list}>
              {hits.map((hit, index) => (
                <li key={hit.element.id}>
                  <button
                    type="button"
                    onKeyDown={(e) => move(e, index)}
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
