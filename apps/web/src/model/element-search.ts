import { ELEMENT_KIND_LABELS, type ElementSnapshot } from "@sujigaki/domain";

export const SEARCH_LIMIT = 10;

export interface SearchHit {
  readonly element: ElementSnapshot;
  readonly kindLabel: string;
  /** 名前に当てはまったか。名前に当てはまらず、要約だけに当てはまったら false */
  readonly inName: boolean;
}

/**
 * 要素を名前と要約で探す（FR-026、画面設計書 4章）。英字の大文字と小文字は区別しない。
 * 名前に当てはまる要素を先に並べ、削除済みの要素は出さない
 */
export function searchElements(
  elements: readonly ElementSnapshot[],
  query: string,
  limit = SEARCH_LIMIT,
): SearchHit[] {
  const text = query.trim().toLowerCase();
  if (text === "") return [];
  return elements
    .filter((e) => e.deletedAt === null)
    .flatMap((element): SearchHit[] => {
      const inName = element.name.toLowerCase().includes(text);
      if (!inName && !element.summary.toLowerCase().includes(text)) return [];
      return [
        { element, kindLabel: ELEMENT_KIND_LABELS[element.kind], inName },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.inName) - Number(a.inName) ||
        a.element.name.localeCompare(b.element.name, "ja"),
    )
    .slice(0, limit);
}
