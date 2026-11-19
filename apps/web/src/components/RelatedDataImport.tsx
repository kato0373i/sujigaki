import {
  diffElements,
  type ImportDiff,
  RELATED_DATA_SOURCE,
  type ReadIssue,
  readRelatedData,
} from "@sujigaki/interchange";
import { type ChangeEvent, useState } from "react";
import { ApiProblem, applyChangeSet, type Snapshot } from "../api.ts";
import { changeSetBody } from "../model/import-review.ts";
import { ImportDiffView } from "./ImportDiffView.tsx";

type Loaded =
  | { readonly state: "none" }
  | { readonly state: "invalid"; readonly issues: readonly ReadIssue[] }
  | { readonly state: "import"; readonly diff: ImportDiff };

/** 新しい要素の ID。ID に使える英数字と「-」だけにする */
const newId = () => `rdra-${crypto.randomUUID()}`;

/**
 * S-09 の関連データの読み込み（FR-052）。種類と名前で今の要素と対応づけ、差分から採用した変更だけを反映する
 */
export function RelatedDataImport({
  projectId,
  snapshot,
  onChanged,
}: {
  projectId: string;
  snapshot: Snapshot;
  onChanged: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ state: "none" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setMessage(null);
    if (!file) return;
    const read = readRelatedData(
      await file.text(),
      snapshot.elements,
      new Date(),
      newId,
    );
    setLoaded(
      read.ok
        ? {
            state: "import",
            diff: diffElements(snapshot.elements, read.elements, {
              removeMissing: true,
            }),
          }
        : { state: "invalid", issues: read.issues },
    );
  };

  const apply = async (adopted: Parameters<typeof changeSetBody>[0]) => {
    setBusy(true);
    setMessage(null);
    try {
      await applyChangeSet(
        projectId,
        changeSetBody(adopted, {
          authorType: "import",
          source: RELATED_DATA_SOURCE,
        }),
      );
      setLoaded({ state: "none" });
      setMessage({
        ok: true,
        text: `${adopted.length}件の変更を反映しました。`,
      });
      onChanged();
    } catch (problem) {
      setMessage({
        ok: false,
        text:
          problem instanceof ApiProblem && problem.code === "VERSION_CONFLICT"
            ? `差分を出したあとに更新された要素があるため、反映しませんでした。もう一度ファイルを選んで、差分を出し直してください。（${problem.message}）`
            : (problem as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="io-section" aria-labelledby="related-import-heading">
      <h2 id="related-import-heading">RDRA の関連データの読み込み</h2>
      <p className="muted">
        種類と名前が同じ要素を同じ要素とみなし、差分から採用した変更だけを反映します。要求と、つながりのない要素は変えません。
      </p>
      <label className="file">
        <span>読み込む関連データ</span>
        <input type="file" accept=".tsv,.txt" onChange={readFile} />
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
          <p>関連データの形式が正しくないため、読み込めません。</p>
          <ul>
            {loaded.issues.map((issue) => (
              <li key={`${issue.line}-${issue.message}`}>
                {issue.line !== null && `${issue.line}行目: `}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {loaded.state === "import" && (
        <ImportDiffView
          diff={loaded.diff}
          known={snapshot.elements}
          busy={busy}
          onApply={apply}
        />
      )}
    </section>
  );
}
