import type { Actor } from "@sujigaki/domain";
import {
  diffElements,
  type ImportDiff,
  type ReadIssue,
  readProjectYaml,
  writeProjectYaml,
} from "@sujigaki/interchange";
import { type ChangeEvent, useState } from "react";
import {
  ApiProblem,
  applyChangeSet,
  restoreProject,
  type Snapshot,
} from "../api.ts";
import { ImportDiffView } from "../components/ImportDiffView.tsx";
import { RelatedDataExport } from "../components/RelatedDataExport.tsx";
import { RelatedDataImport } from "../components/RelatedDataImport.tsx";
import { downloadText } from "../download.ts";
import { changeSetBody, restoreNotice } from "../model/import-review.ts";

type Loaded =
  | { readonly state: "none" }
  | { readonly state: "invalid"; readonly issues: readonly ReadIssue[] }
  | {
      readonly state: "restore";
      readonly yaml: string;
      readonly elements: number;
    }
  | {
      readonly state: "import";
      readonly fileName: string;
      readonly diff: ImportDiff;
    };

/** S-09 読み込みと書き出し。このツールの YAML（FR-050）と、RDRA の関連データ（FR-051、FR-052） */
export function ImportExport({
  projectId,
  snapshot,
  actor,
  onChanged,
}: {
  projectId: string;
  snapshot: Snapshot;
  actor: Actor;
  onChanged: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ state: "none" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const empty =
    snapshot.elements.length +
      snapshot.questions.length +
      snapshot.decisions.length +
      snapshot.layouts.length ===
    0;

  const exportYaml = () =>
    downloadText(
      `${snapshot.project.name}.sujigaki.yaml`,
      writeProjectYaml(snapshot),
      "application/yaml",
    );

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setMessage(null);
    if (!file) return;
    const yaml = await file.text();
    const read = readProjectYaml(yaml);
    if (!read.ok) {
      setLoaded({ state: "invalid", issues: read.issues });
    } else if (empty) {
      setLoaded({
        state: "restore",
        yaml,
        elements: read.document.elements.length,
      });
    } else {
      // 書き出したファイル全体を取り込むため、ファイルにない要素は削除の変更にする
      const diff = diffElements(snapshot.elements, read.document.elements, {
        removeMissing: true,
      });
      setLoaded({ state: "import", fileName: file.name, diff });
    }
  };

  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await task();
      setLoaded({ state: "none" });
      setMessage({ ok: true, text });
      onChanged();
    } catch (problem) {
      const text =
        problem instanceof ApiProblem && problem.code === "VERSION_CONFLICT"
          ? `差分を出したあとに更新された要素があるため、反映しませんでした。もう一度ファイルを選んで、差分を出し直してください。（${problem.message}）`
          : (problem as Error).message;
      setMessage({ ok: false, text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="screen io">
      <h1>読み込みと書き出し</h1>

      <section className="io-section" aria-labelledby="export-heading">
        <h2 id="export-heading">書き出し</h2>
        <p className="muted">
          モデル全体を、このツールの YAML
          のファイルにします。削除済みの要素は含めません。
        </p>
        <button type="button" onClick={exportYaml}>
          YAML を書き出す
        </button>
      </section>

      <RelatedDataExport snapshot={snapshot} />

      <section className="io-section" aria-labelledby="import-heading">
        <h2 id="import-heading">YAML の読み込み</h2>
        <p className="muted">
          {empty
            ? "空のプロジェクトなので、ファイルの内容をそのまま復元します。"
            : "今のモデルとの差分を出し、採用した変更だけを反映します。"}
        </p>
        <label className="file">
          <span>読み込むファイル</span>
          <input type="file" accept=".yaml,.yml" onChange={readFile} />
        </label>

        {message && (
          <p
            className={message.ok ? "success" : "error-inline"}
            role={message.ok ? "status" : "alert"}
          >
            {message.text}
          </p>
        )}

        {loaded.state === "invalid" && (
          <div className="problems" role="alert">
            <p>ファイルの形式が正しくないため、読み込めません。</p>
            <ul>
              {loaded.issues.map((issue) => (
                <li
                  key={`${issue.line}-${issue.path.join(".")}-${issue.message}`}
                >
                  {issue.line !== null && `${issue.line}行目: `}
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loaded.state === "restore" && (
          <div className="restore">
            <p>
              {loaded.elements}件の要素を復元します。{restoreNotice(actor)}
            </p>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const result = await restoreProject(projectId, loaded.yaml);
                  return `${result.elements}件の要素を復元しました。`;
                })
              }
            >
              復元する
            </button>
          </div>
        )}

        {loaded.state === "import" && (
          <ImportDiffView
            diff={loaded.diff}
            known={snapshot.elements}
            busy={busy}
            onApply={(adopted) =>
              run(async () => {
                await applyChangeSet(
                  projectId,
                  changeSetBody(adopted, {
                    authorType: "import",
                    source: `YAML の取り込み（${loaded.fileName}）`,
                  }),
                );
                return `${adopted.length}件の変更を反映しました。`;
              })
            }
          />
        )}
      </section>
      <RelatedDataImport
        projectId={projectId}
        snapshot={snapshot}
        onChanged={onChanged}
      />
    </section>
  );
}
