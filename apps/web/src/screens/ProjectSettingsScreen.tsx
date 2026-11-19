import type { ProjectSettings } from "@sujigaki/domain";
import { useState } from "react";
import { updateProjectSettings } from "../api.ts";
import { settingsChanges, settingsDraftOf } from "../model/project-settings.ts";

/** S-12 プロジェクトの設定（FR-005）。変えた項目があるときだけ保存できる */
export function ProjectSettingsScreen({
  projectId,
  settings,
  onChanged,
}: {
  projectId: string;
  settings: ProjectSettings;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(() => settingsDraftOf(settings));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const { changes, error } = settingsChanges(settings, draft);

  const save = async () => {
    if (!changes) return;
    setMessage(null);
    try {
      await updateProjectSettings(projectId, changes);
      setMessage({ ok: true, text: "設定を保存しました。" });
      onChanged();
    } catch (problem) {
      setMessage({ ok: false, text: (problem as Error).message });
    }
  };

  return (
    <section className="screen settings">
      <h1>プロジェクトの設定</h1>
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span>プロジェクトの名前</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>システム名</span>
          <input
            value={draft.systemName}
            aria-describedby="system-name-help"
            onChange={(e) => setDraft({ ...draft, systemName: e.target.value })}
          />
        </label>
        <p id="system-name-help" className="muted">
          RDRA の関連データに書き出すときの、システムの名前です。
        </p>
        <label className="field">
          <span>要約の上限（字）</span>
          <input
            type="number"
            min={1}
            step={1}
            value={draft.summaryMaxLength}
            aria-describedby="summary-max-help"
            aria-invalid={error !== null}
            onChange={(e) =>
              setDraft({ ...draft, summaryMaxLength: e.target.value })
            }
          />
        </label>
        <p id="summary-max-help" className="muted">
          上限を超える要約も保存できます。超えた要約は検証の違反として出ます。
        </p>
        {error && (
          <p className="error-inline" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p
            className={message.ok ? "success" : "error-inline"}
            role={message.ok ? "status" : "alert"}
          >
            {message.text}
          </p>
        )}
        <button type="submit" className="primary" disabled={changes === null}>
          保存
        </button>
      </form>
    </section>
  );
}
