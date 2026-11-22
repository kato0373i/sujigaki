import { type ReactNode, useState } from "react";

const STORAGE_KEY = "sujigaki.panel.closed";

/** 畳んだ節の一覧。ブラウザに覚えておき、ほかの要素を開いても同じ節を畳んだままにする */
function closedSections(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function rememberClosed(id: string, closed: boolean) {
  try {
    const others = closedSections().filter((s) => s !== id);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(closed ? [...others, id] : others),
    );
  } catch {
    // 覚えられないときは、開閉はその場だけにする
  }
}

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
  const [open, setOpen] = useState(() => !closedSections().includes(id));
  const toggle = () => {
    rememberClosed(id, open);
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
