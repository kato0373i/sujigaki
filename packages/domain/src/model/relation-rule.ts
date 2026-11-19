import {
  ELEMENT_KIND_LABELS,
  ELEMENT_KINDS,
  type ElementKind,
} from "./element-kind.ts";
import { RELATION_TYPES, type RelationType } from "./relation-type.ts";

export type ResolveRelationResult =
  | {
      readonly ok: true;
      readonly type: RelationType;
      /** 渡した順と元・先が逆のとき true。保存するときは type の向きにそろえる */
      readonly reversed: boolean;
    }
  | {
      readonly ok: false;
      readonly code: "RELATION_NOT_ALLOWED";
      readonly message: string;
    };

export function findRelationType(
  from: ElementKind,
  to: ElementKind,
): RelationType | undefined {
  return RELATION_TYPES.find((type) => type.from === from && type.to === to);
}

/** その種類の要素とつなげる種類を、要素の種類の定義順で返す */
export function connectableKinds(kind: ElementKind): ElementKind[] {
  const kinds = new Set<ElementKind>();
  for (const type of RELATION_TYPES) {
    if (type.from === kind) kinds.add(type.to);
    if (type.to === kind) kinds.add(type.from);
  }
  return ELEMENT_KINDS.filter((k) => kinds.has(k));
}

/**
 * 2つの要素の種類から、つながりの種類を求める。画面ではどちらの要素からもつなげるため、
 * 定義と逆の順で渡されたときも見つける（FR-001、FR-010）。
 */
export function resolveRelation(
  a: ElementKind,
  b: ElementKind,
): ResolveRelationResult {
  const forward = findRelationType(a, b);
  if (forward) return { ok: true, type: forward, reversed: false };
  const backward = findRelationType(b, a);
  if (backward) return { ok: true, type: backward, reversed: true };

  const label = (kind: ElementKind) => ELEMENT_KIND_LABELS[kind];
  const candidates = connectableKinds(a).map(label).join("・");
  return {
    ok: false,
    code: "RELATION_NOT_ALLOWED",
    message: `「${label(a)}」と「${label(b)}」は直接つなげません。「${label(a)}」とつなげるのは、${candidates}です。`,
  };
}
