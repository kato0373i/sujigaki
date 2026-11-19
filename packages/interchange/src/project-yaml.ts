import { stringify } from "yaml";
import type { ProjectDocument } from "./document.ts";
import {
  decodeDocument,
  encodeDocument,
  parseYaml,
  type ReadResult,
} from "./yaml-codec.ts";

export type { ReadIssue, ReadResult } from "./yaml-codec.ts";

/** モデル全体を1つの YAML ファイルに書き出す（FR-050）。既定の値と同じ項目は省く */
export function writeProjectYaml(document: ProjectDocument): string {
  return stringify(encodeDocument(document), { lineWidth: 0 });
}

/**
 * 1つの YAML ファイルを読み込む。形式に合わなければ、モデルは作らずに合わない箇所をすべて返す（FR-050）。
 */
export function readProjectYaml(text: string): ReadResult {
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
  return decoded;
}
