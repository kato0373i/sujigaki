import {
  businessScope,
  exportRelatedData,
  type RelatedDataWarning,
} from "@sujigaki/interchange";
import { useMemo, useState } from "react";
import type { Snapshot } from "../api.ts";
import { downloadText } from "../download.ts";
import { type IoScope, scopedFileName } from "../model/io-scope.ts";

const WARNING_HEADINGS: Readonly<Record<RelatedDataWarning["type"], string>> = {
  duplicateName: "名前が重なる要素（関連データでは同じ要素として扱われます）",
  replacedText: "区切りの文字を置き換えた要素",
  notExported: "つながりがないため、関連データに出てこない要素",
};

/** S-09 の関連データの書き出し（FR-051）。書き出す前に、知らせることを出す */
export function RelatedDataExport({
  snapshot,
  scope,
}: {
  snapshot: Snapshot;
  scope: IoScope;
}) {
  const result = useMemo(
    () =>
      exportRelatedData(
        snapshot.project.systemName,
        scope
          ? businessScope(snapshot, scope.businessId).elements
          : snapshot.elements,
      ),
    [snapshot, scope],
  );
  const [copied, setCopied] = useState(false);
  const groups = (
    Object.keys(WARNING_HEADINGS) as RelatedDataWarning["type"][]
  ).flatMap((type) => {
    const items = result.warnings.filter((w) => w.type === type);
    return items.length > 0 ? [{ type, items }] : [];
  });

  const copy = async () => {
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
  };

  return (
    <section className="io-section" aria-labelledby="related-export-heading">
      <h2 id="related-export-heading">RDRA の関連データの書き出し</h2>
      <p className="muted">
        RDRAGraph や RDRA
        定義・分析シートで使う形式です。要求と、このツール独自の属性（担当者・確認状態など）は含みません。
      </p>
      {groups.length > 0 && (
        <div className="problems warning">
          {groups.map(({ type, items }) => (
            <div key={type}>
              <p>{WARNING_HEADINGS[type]}</p>
              <ul>
                {items.map((w) => (
                  <li
                    key={
                      w.type === "duplicateName"
                        ? `${w.kindLabel}-${w.name}`
                        : w.elementId
                    }
                  >
                    {w.kindLabel} {w.name}
                    {w.type === "duplicateName" && `（${w.count}件）`}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="io-actions">
        <button type="button" onClick={copy}>
          {copied ? "コピーしました" : "関連データをコピー"}
        </button>
        <button
          type="button"
          onClick={() =>
            downloadText(
              scopedFileName(snapshot.project.name, scope, "rdra.tsv"),
              result.text,
              "text/tab-separated-values",
            )
          }
        >
          ファイルに書き出す
        </button>
      </div>
    </section>
  );
}
