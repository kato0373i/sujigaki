import { type ReactNode, useState } from "react";
import { readStoredSet, writeStoredSet } from "../stored-set.ts";

/** 畳んだ節の一覧のキー。ほかの要素を開いても同じ節を畳んだままにする */
const STORAGE_KEY = "sujigaki.panel.closed";

/**
 * 詳細パネルの節（#172）。見出しのボタンで畳めて、畳んでいるあいだも件数などの要約を見出しに出す
 */
export function PanelSection({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: string;
  summary?: string | undefined;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(
    () => !readStoredSet(STORAGE_KEY).includes(id),
  );
  const toggle = () => {
    writeStoredSet(STORAGE_KEY, id, open);
    setOpen(!open);
  };
  return (
    <section aria-labelledby={`${id}-heading`} className="panel-section">
      <h3 id={`${id}-heading`}>
        <button
          type="button"
          className="section-toggle"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={toggle}
        >
          <span className="section-caret" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
          {title}
        </button>
        {summary && <span className="section-summary">{summary}</span>}
      </h3>
      <div id={`${id}-body`} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
