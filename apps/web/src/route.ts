import { useEffect, useState } from "react";

/** 画面の場所。URL の # のあとに書く */
export type Route =
  | { readonly screen: "businesses" }
  | { readonly screen: "board" }
  | { readonly screen: "io" }
  | { readonly screen: "trace" }
  | { readonly screen: "ai" }
  | { readonly screen: "flow"; readonly bucId: string }
  | { readonly screen: "chain"; readonly originId: string };

export function parseRoute(hash: string): Route {
  if (hash === "#/board") return { screen: "board" };
  if (hash === "#/io") return { screen: "io" };
  if (hash === "#/trace") return { screen: "trace" };
  if (hash === "#/ai") return { screen: "ai" };
  const chain = /^#\/chain\/([A-Za-z0-9_-]+)$/.exec(hash);
  if (chain?.[1]) return { screen: "chain", originId: chain[1] };
  const match = /^#\/flows\/([A-Za-z0-9_-]+)$/.exec(hash);
  return match?.[1]
    ? { screen: "flow", bucId: match[1] }
    : { screen: "businesses" };
}

export function hrefOf(route: Route): string {
  if (route.screen === "flow") return `#/flows/${route.bucId}`;
  if (route.screen === "chain") return `#/chain/${route.originId}`;
  if (route.screen === "board") return "#/board";
  if (route.screen === "trace") return "#/trace";
  if (route.screen === "ai") return "#/ai";
  return route.screen === "io" ? "#/io" : "#/";
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
