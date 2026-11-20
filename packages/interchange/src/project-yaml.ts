import { stringify } from "yaml";
import type { ProjectDocument } from "./document.ts";
import {
  decodeDocument,
  encodeDocument,
  parseYaml,
  type ReadIssue,
} from "./yaml-codec.ts";

export type { ReadIssue, ReadResult } from "./yaml-codec.ts";

/** 業務の範囲だけを書き出したファイルの、その業務（設計書 5.5 節） */
export interface DocumentScope {
  readonly businessId: string;
}

export type ProjectYamlRead =
  | {
      readonly ok: true;
      readonly document: ProjectDocument;
      /** 業務の範囲のファイルなら、その業務。モデル全体なら null */
      readonly scope: DocumentScope | null;
    }
  | { readonly ok: false; readonly issues: readonly ReadIssue[] };

/**
 * モデルを1つの YAML ファイルに書き出す（FR-050）。既定の値と同じ項目は省く。
 * 業務の範囲を書き出すときは、範囲を切り出した内容と scope を渡す
 */
export function writeProjectYaml(
  document: ProjectDocument,
  scope?: DocumentScope,
): string {
  return stringify(encodeDocument(document, scope), { lineWidth: 0 });
}

/**
 * 1つの YAML ファイルを読み込む。形式に合わなければ、モデルは作らずに合わない箇所をすべて返す（FR-050）。
 */
export function readProjectYaml(text: string): ProjectYamlRead {
  const parsed = parseYaml(text);
  if (!parsed.ok) return parsed;
  const decoded = decodeDocument(parsed.value);
  if (!decoded.ok) {
    return {
      ok: false,
      issues: decoded.issues.map((issue) => ({
        ...issue,
        line: parsed.locate(issue.path),
      })),
    };
  }
  const scope = (parsed.value as { scope?: DocumentScope }).scope;
  return {
    ok: true,
    document: decoded.document,
    scope: scope ? { businessId: scope.businessId } : null,
  };
}
