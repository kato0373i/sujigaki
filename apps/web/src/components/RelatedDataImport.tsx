import { ELEMENT_KIND_LABELS } from "@sujigaki/domain";
import {
  businessScopeIds,
  diffElements,
  type ImportDiff,
  RELATED_DATA_SOURCE,
  type ReadIssue,
  type RenameCandidate,
  readRelatedData,
  renameCandidates,
  renameKey,
} from "@sujigaki/interchange";
import { type ChangeEvent, useState } from "react";
import {
  ApiProblem,
  applyChangeSet,
  type Snapshot,
  updateProjectSettings,
} from "../api.ts";
import { changeSetBody } from "../model/import-review.ts";
import type { IoScope } from "../model/io-scope.ts";
import { ImportDiffView } from "./ImportDiffView.tsx";

type Loaded =
  | { readonly state: "none" }
  | { readonly state: "invalid"; readonly issues: readonly ReadIssue[] }
  | {
      readonly state: "rename";
      readonly text: string;
      readonly rows: readonly RenameCandidate[];
    }
  | { readonly state: "import"; readonly diff: ImportDiff };

/** 「別の要素として扱う」を表す選択肢の値 */
const SEPARATE = "";

/** 新しい要素の ID。ID に使える英数字と「-」だけにする */
const newId = () => `rdra-${crypto.randomUUID()}`;

/**
 * S-09 の関連データの読み込み（FR-052）。種類と名前で今の要素と対応づけ、差分から採用した変更だけを反映する
 */
export function RelatedDataImport({
  projectId,
  snapshot,
  scope,
  onChanged,
}: {
  projectId: string;
  snapshot: Snapshot;
  /** 業務の範囲の関連データなら、その業務。範囲の外の要素を削除の変更にしない */
  scope: IoScope;
  onChanged: () => void;
}) {
  const scopeIds = scope
    ? businessScopeIds(snapshot, scope.businessId)
    : undefined;
  const [loaded, setLoaded] = useState<Loaded>({ state: "none" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // 空のプロジェクトでは、1行目のシステム名をプロジェクトのシステム名にするかを選べる（#117）
  const [newSystemName, setNewSystemName] = useState<string | null>(null);
  const [useSystemName, setUseSystemName] = useState(true);

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setMessage(null);
    if (!file) return;
    const text = await file.text();
    const read = readRelatedData(text, snapshot.elements, new Date(), newId, {
      ...(scopeIds && { scope: scopeIds }),
    });
    if (!read.ok) {
      setLoaded({ state: "invalid", issues: read.issues });
      return;
    }
    setNewSystemName(
      snapshot.elements.length === 0 &&
        read.systemName &&
        read.systemName !== snapshot.project.systemName
        ? read.systemName
        : null,
    );
    setUseSystemName(true);
    const rows = renameCandidates(snapshot.elements, read.elements);
    if (rows.length > 0) {
      setLoaded({ state: "rename", text, rows });
      return;
    }
    showDiff(read.elements);
  };

  const showDiff = (elements: Parameters<typeof diffElements>[1]) =>
    setLoaded({
      state: "import",
      diff: diffElements(snapshot.elements, elements, { removeMissing: true }),
    });

  /** 利用者が同じ要素と選んだ組で読み直し、差分を出す（設計書 5.9 節） */
  const decideRenames = (
    text: string,
    choices: ReadonlyMap<string, string>,
  ) => {
    const chosen = [...choices.values()].filter((key) => key !== SEPARATE);
    if (new Set(chosen).size !== chosen.length) {
      setMessage({
        ok: false,
        text: "同じ新しい要素を、2つ以上の要素に対応づけています。",
      });
      return;
    }
    setMessage(null);
    const renames = new Map(
      [...choices].flatMap(([elementId, key]) =>
        key === SEPARATE ? [] : [[key, elementId] as const],
      ),
    );
    const read = readRelatedData(text, snapshot.elements, new Date(), newId, {
      renames,
      ...(scopeIds && { scope: scopeIds }),
    });
    if (read.ok) showDiff(read.elements);
    else setLoaded({ state: "invalid", issues: read.issues });
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
      const renamed = newSystemName !== null && useSystemName;
      if (renamed)
        await updateProjectSettings(projectId, { systemName: newSystemName });
      setLoaded({ state: "none" });
      setNewSystemName(null);
      setMessage({
        ok: true,
        text:
          `${adopted.length}件の変更を反映しました。` +
          (renamed ? `システム名を「${newSystemName}」にしました。` : ""),
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
        {scope &&
          `業務「${scope.name}」の範囲の関連データとして読み込み、範囲の外の要素は変えません。`}
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
      {loaded.state === "rename" && (
        <RenameStep
          rows={loaded.rows}
          onDecide={(choices) => decideRenames(loaded.text, choices)}
        />
      )}
      {loaded.state === "import" && newSystemName && (
        <label className="system-name-choice">
          <input
            type="checkbox"
            checked={useSystemName}
            onChange={(e) => setUseSystemName(e.target.checked)}
          />{" "}
          1行目のシステム名「{newSystemName}
          」を、このプロジェクトのシステム名にする
        </label>
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

/** 名前の変更が疑われる要素を、同じ要素として名前を変えるか、別の要素として扱うかを選ぶ（S-09） */
function RenameStep({
  rows,
  onDecide,
}: {
  rows: readonly RenameCandidate[];
  onDecide: (choices: ReadonlyMap<string, string>) => void;
}) {
  const [choices, setChoices] = useState<ReadonlyMap<string, string>>(
    () =>
      new Map(
        rows.map((row) => [
          row.element.id as string,
          row.preselected ? renameKey(row.preselected) : SEPARATE,
        ]),
      ),
  );
  return (
    <div className="rename-step">
      <h3>名前が変わった要素の確認</h3>
      <p className="muted">
        関連データにない要素と、同じ種類の新しい要素があります。名前を変えた同じ要素なら、対応づけてください。
      </p>
      <ul className="plain">
        {rows.map((row) => {
          const id = `rename-${row.element.id}`;
          return (
            <li key={row.element.id}>
              <label htmlFor={id}>
                <span className="muted">
                  {ELEMENT_KIND_LABELS[row.element.kind]}
                </span>{" "}
                {row.element.name}
              </label>
              <select
                id={id}
                value={choices.get(row.element.id) ?? SEPARATE}
                onChange={(e) =>
                  setChoices(
                    new Map(choices).set(row.element.id, e.target.value),
                  )
                }
              >
                <option value={SEPARATE}>別の要素として扱う（削除する）</option>
                {row.candidates.map((c) => (
                  <option key={c.element.id} value={renameKey(c.element)}>
                    「{c.element.name}」に名前を変える
                    {c.suspected ? "（つながりが重なる）" : ""}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="primary"
        onClick={() => onDecide(choices)}
      >
        差分を出す
      </button>
    </div>
  );
}
