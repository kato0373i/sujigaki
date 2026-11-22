import { type ElementKind, isElementKind } from "@sujigaki/domain";
import { useEffect, useRef, useState } from "react";

/** 画面の場所。URL の # のあとに書く */
export type Route =
  | { readonly screen: "businesses" }
  | { readonly screen: "board" }
  | { readonly screen: "io" }
  | { readonly screen: "trace" }
  | { readonly screen: "ai" }
  | { readonly screen: "deleted" }
  | { readonly screen: "settings" }
  /** kind が null なら、要素のある最初の種類を出す */
  | { readonly screen: "elements"; readonly kind: ElementKind | null }
  /** modelId が null なら、名前の順で最初の状態の流れを出す */
  | { readonly screen: "states"; readonly modelId: string | null }
  | { readonly screen: "flow"; readonly bucId: string }
  /** originId が null なら、起点を選ぶところから始める（#174） */
  | { readonly screen: "chain"; readonly originId: string | null };

export function parseRoute(hash: string): Route {
  if (hash === "#/board") return { screen: "board" };
  if (hash === "#/io") return { screen: "io" };
  if (hash === "#/trace") return { screen: "trace" };
  if (hash === "#/ai") return { screen: "ai" };
  if (hash === "#/deleted") return { screen: "deleted" };
  if (hash === "#/settings") return { screen: "settings" };
  if (hash === "#/elements") return { screen: "elements", kind: null };
  const kind = /^#\/elements\/([A-Za-z]+)$/.exec(hash)?.[1];
  if (kind && isElementKind(kind)) return { screen: "elements", kind };
  if (hash === "#/states") return { screen: "states", modelId: null };
  const model = /^#\/states\/([A-Za-z0-9_-]+)$/.exec(hash)?.[1];
  if (model) return { screen: "states", modelId: model };
  if (hash === "#/chain") return { screen: "chain", originId: null };
  const chain = /^#\/chain\/([A-Za-z0-9_-]+)$/.exec(hash);
  if (chain?.[1]) return { screen: "chain", originId: chain[1] };
  const match = /^#\/flows\/([A-Za-z0-9_-]+)$/.exec(hash);
  return match?.[1]
    ? { screen: "flow", bucId: match[1] }
    : { screen: "businesses" };
}

export function hrefOf(route: Route): string {
  if (route.screen === "flow") return `#/flows/${route.bucId}`;
  if (route.screen === "chain")
    return route.originId ? `#/chain/${route.originId}` : "#/chain";
  if (route.screen === "elements")
    return route.kind ? `#/elements/${route.kind}` : "#/elements";
  if (route.screen === "states")
    return route.modelId ? `#/states/${route.modelId}` : "#/states";
  if (route.screen === "board") return "#/board";
  if (route.screen === "trace") return "#/trace";
  if (route.screen === "ai") return "#/ai";
  if (route.screen === "deleted") return "#/deleted";
  if (route.screen === "settings") return "#/settings";
  return route.screen === "io" ? "#/io" : "#/";
}

/**
 * URL の # から今の画面を返す。canLeave が false を返したら、移る前の URL に戻して画面を変えない。
 * 詳細パネルの保存していない変更を、画面を移る前に確かめるために使う（画面設計書 P-01）
 */
export function useRoute(canLeave?: (nextHash: string) => boolean): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const current = useRef(window.location.hash);
  const guard = useRef(canLeave);
  guard.current = canLeave;
  useEffect(() => {
    const update = () => {
      const next = window.location.hash;
      if (next === current.current) return;
      if (guard.current && !guard.current(next)) {
        // 履歴を増やさずに、移る前の URL に戻す
        window.history.replaceState(null, "", current.current || "#/");
        return;
      }
      current.current = next;
      setRoute(parseRoute(next));
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
