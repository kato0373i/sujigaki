export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** JSON の値として等しいかを返す。オブジェクトのキーの順は問わない */
export function jsonEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((value, i) => jsonEqual(value, b[i] as JsonValue));
  }
  const objA = a as { readonly [key: string]: JsonValue };
  const objB = b as { readonly [key: string]: JsonValue };
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) return false;
  return keysA.every(
    (key) =>
      key in objB && jsonEqual(objA[key] as JsonValue, objB[key] as JsonValue),
  );
}
