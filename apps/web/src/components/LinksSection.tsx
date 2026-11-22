import {
  type ElementSnapshot,
  EXTERNAL_LINK_KIND_LABELS,
  EXTERNAL_LINK_KINDS,
  type ExternalLink,
  type ExternalLinkKind,
} from "@sujigaki/domain";
import { type FormEvent, useState } from "react";
import { ApiProblem, updateElement } from "../api.ts";
import { useFocusFirst } from "../focus.ts";
import { PanelSection } from "./PanelSection.tsx";

/**
 * 詳細パネルの外部リンク（画面設計書 P-01、FR-004）。追加と外す操作は押したときにすぐ保存し、確認状態は戻さない
 */
export function LinksSection({
  projectId,
  element,
  canEdit,
  onChanged,
  onError,
}: {
  projectId: string;
  element: ElementSnapshot;
  canEdit: boolean;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const save = async (links: readonly ExternalLink[]) => {
    onError(null);
    try {
      await updateElement(projectId, element, element.version, { links });
      onChanged();
      return true;
    } catch (problem) {
      onError(
        problem instanceof ApiProblem && problem.code === "VERSION_CONFLICT"
          ? "ほかの人が先にこの要素を更新したため、保存しませんでした。読み直してから、もう一度操作してください。"
          : (problem as Error).message,
      );
      return false;
    }
  };

  return (
    <PanelSection
      id="links"
      title="外部リンク"
      summary={
        element.links.length > 0 ? `${element.links.length}件` : undefined
      }
    >
      {element.links.length === 0 ? (
        <p className="muted">外部リンクはありません。</p>
      ) : (
        <ul className="plain relations">
          {element.links.map((link) => (
            <li key={link.id}>
              <span>
                <span className="muted">
                  {EXTERNAL_LINK_KIND_LABELS[link.kind]}
                </span>{" "}
                <a href={link.url} target="_blank" rel="noreferrer noopener">
                  {link.label ?? link.url}
                </a>
              </span>
              {canEdit && (
                <button
                  type="button"
                  className="link danger"
                  aria-label={`リンク「${link.label ?? link.url}」を外す`}
                  onClick={() =>
                    save(element.links.filter((l) => l.id !== link.id))
                  }
                >
                  外す
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && <AddLink onAdd={(link) => save([...element.links, link])} />}
    </PanelSection>
  );
}

/** 「＋ リンクを追加」。種類・URL・名前（任意）を入れて付ける */
function AddLink({
  onAdd,
}: {
  onAdd: (link: ExternalLink) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExternalLinkKind>("manual");
  const formRef = useFocusFirst<HTMLFormElement>(open);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        ＋ リンクを追加
      </button>
    );
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (url.trim() === "") return;
    const ok = await onAdd({
      id: `link-${crypto.randomUUID()}`,
      kind,
      url: url.trim(),
      label: label.trim() || null,
    });
    if (ok) {
      setUrl("");
      setLabel("");
      setOpen(false);
    }
  };
  return (
    <form className="add-link" onSubmit={submit} ref={formRef}>
      <label className="field">
        <span>リンクの種類</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ExternalLinkKind)}
        >
          {EXTERNAL_LINK_KINDS.map((k) => (
            <option key={k} value={k}>
              {EXTERNAL_LINK_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>URL</span>
        <input
          inputMode="url"
          value={url}
          placeholder="https://"
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label className="field">
        <span>リンクの名前（任意）</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <div className="question-actions">
        <button type="submit" disabled={url.trim() === ""}>
          リンクを付ける
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          やめる
        </button>
      </div>
    </form>
  );
}
