import type { ElementSnapshot } from "@sujigaki/domain";

/** S-09 で選んだ範囲（画面設計書 S-09）。null はモデル全体 */
export type IoScope = {
  readonly businessId: string;
  readonly name: string;
} | null;

/** 範囲に選べる業務。名前の順に並べる */
export function scopeChoices(
  elements: readonly ElementSnapshot[],
): { readonly businessId: string; readonly name: string }[] {
  return elements
    .filter((e) => e.kind === "business" && e.deletedAt === null)
    .map((e) => ({ businessId: e.id as string, name: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/** 書き出すファイルの名前。業務の範囲なら、業務の名前を入れる */
export function scopedFileName(
  projectName: string,
  scope: IoScope,
  extension: string,
): string {
  return scope
    ? `${projectName}-${scope.name}.${extension}`
    : `${projectName}.${extension}`;
}
