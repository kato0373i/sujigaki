import { useEffect, useRef } from "react";

/**
 * 開いた欄の最初の入力にフォーカスを移す（#113）。返した ref を欄を囲む要素に付ける。
 * 欄を開いた直後に文字を打っても、ほかの入力に入らないようにする。open が true になったときに移す
 */
export function useFocusFirst<T extends HTMLElement>(open = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
  }, [open]);
  return ref;
}
