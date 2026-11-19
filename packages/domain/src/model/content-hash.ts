import type { JsonValue } from "../shared/json.ts";
import type { ElementSnapshot } from "./element.ts";

/** キーを並べ替えた JSON の文字列にする。同じ内容なら、キーの順によらず同じ文字列になる */
function canonical(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as { readonly [key: string]: JsonValue };
  return `{${Object.keys(object)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonical(object[key] as JsonValue)}`,
    )
    .join(",")}}`;
}

/** 文字列から53ビットのハッシュを求める（cyrb53）。暗号用ではない */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, "0");
}

/**
 * 要素の内容のハッシュ（FR-041、設計書 5.5 節）。名前・要約・属性・つながりの種類と先から求める。
 * つながりの並び順と ID は問わない。外部リンクは確認状態を戻さない（FR-013）ため、含めない
 */
export function contentHash(
  element: Pick<
    ElementSnapshot,
    "name" | "summary" | "attributes" | "relations"
  >,
): string {
  const relations = element.relations.map((r) => `${r.typeId}\n${r.to}`).sort();
  return cyrb53(
    canonical({
      name: element.name,
      summary: element.summary,
      attributes: element.attributes as JsonValue,
      relations,
    }),
  );
}
