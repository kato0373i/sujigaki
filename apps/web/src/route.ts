import { useEffect, useState } from "react";

/** 画面の場所。URL の # のあとに書く */
export type Route =
  | { readonly screen: "businesses" }
  | { readonly screen: "board" }
  | { readonly screen: "flow"; readonly bucId: string };

export function parseRoute(hash: string): Route {
  if (hash === "#/board") return { screen: "board" };
  const match = /^#\/flows\/([A-Za-z0-9_-]+)$/.exec(hash);
  return match?.[1]
    ? { screen: "flow", bucId: match[1] }
    : { screen: "businesses" };
}

export function hrefOf(route: Route): string {
  if (route.screen === "flow") return `#/flows/${route.bucId}`;
  return route.screen === "board" ? "#/board" : "#/";
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
