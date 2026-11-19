import { type Actor, validateModel } from "@sujigaki/domain";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSnapshot, LOCAL_PROJECT_ID, type Snapshot } from "./api.ts";
import { ElementPanel } from "./components/ElementPanel.tsx";
import { businessFlowView } from "./model/business-flow.ts";
import { businessListView } from "./model/business-list.ts";
import { defaultFilter } from "./model/review-board.ts";
import { hrefOf, useRoute } from "./route.ts";
import { BusinessFlow } from "./screens/BusinessFlow.tsx";
import { BusinessList } from "./screens/BusinessList.tsx";
import { ReviewBoard } from "./screens/ReviewBoard.tsx";

/** ローカルモードの操作した人。ログインせず、常に管理者として扱う（設計書 5章） */
const LOCAL_ACTOR: Actor = { userId: null, role: "admin" };

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "failed"; readonly message: string }
  | { readonly state: "ready"; readonly snapshot: Snapshot };

/** 画面の共通の構成（画面設計書 4章）。ヘッダー・左のナビゲーション・中央の画面・右の詳細パネル */
export function App() {
  const route = useRoute();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetchSnapshot(LOCAL_PROJECT_ID)
      .then((snapshot) => setLoaded({ state: "ready", snapshot }))
      .catch((error: Error) =>
        setLoaded({ state: "failed", message: error.message }),
      );
  }, []);
  useEffect(reload, [reload]);

  const snapshot = loaded.state === "ready" ? loaded.snapshot : null;
  const selected =
    route.screen !== "businesses"
      ? snapshot?.elements.find(
          (e) => e.id === selectedId && e.deletedAt === null,
        )
      : undefined;
  const rows = useMemo(
    () => (snapshot ? businessListView(snapshot.elements) : []),
    [snapshot],
  );
  const violations = useMemo(
    () =>
      snapshot
        ? validateModel(snapshot.elements, {
            summaryMaxLength: snapshot.project.summaryMaxLength,
          })
        : [],
    [snapshot],
  );

  return (
    <div className={selected ? "app with-panel" : "app"}>
      <header className="header">
        <span className="project-name">
          {snapshot?.project.name ?? "sujigaki"}
        </span>
      </header>
      <nav className="nav" aria-label="業務">
        <a
          href={hrefOf({ screen: "businesses" })}
          className="nav-top"
          aria-current={route.screen === "businesses" ? "page" : undefined}
        >
          業務一覧
        </a>
        <a
          href={hrefOf({ screen: "board" })}
          className="nav-top"
          aria-current={route.screen === "board" ? "page" : undefined}
        >
          確認ボード
        </a>
        <ul>
          {rows.map((row) => (
            <li key={row.business?.id ?? "unassigned"}>
              <span className="nav-business">
                {row.business?.name ?? "業務に属さない"}
              </span>
              <ul>
                {row.flows.map((flow) => (
                  <li key={flow.id}>
                    <a
                      href={hrefOf({ screen: "flow", bucId: flow.id })}
                      aria-current={
                        route.screen === "flow" && route.bucId === flow.id
                          ? "page"
                          : undefined
                      }
                    >
                      {flow.name}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
      <main className="main">
        {loaded.state === "loading" && (
          <p className="empty">読み込んでいます…</p>
        )}
        {loaded.state === "failed" && (
          <p className="error" role="alert">
            {loaded.message}
          </p>
        )}
        {snapshot && route.screen === "businesses" && (
          <BusinessList rows={rows} />
        )}
        {snapshot && route.screen === "board" && (
          <ReviewBoard
            projectId={LOCAL_PROJECT_ID}
            snapshot={snapshot}
            violations={violations}
            initialFilter={defaultFilter(LOCAL_ACTOR)}
            onSelect={setSelectedId}
            onChanged={reload}
          />
        )}
        {snapshot && route.screen === "flow" && (
          <FlowScreen
            snapshot={snapshot}
            bucId={route.bucId}
            violations={violations}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </main>
      {snapshot && selected && (
        <ElementPanel
          key={`${selected.id}-${selected.version}`}
          projectId={LOCAL_PROJECT_ID}
          element={selected}
          snapshot={snapshot}
          actor={LOCAL_ACTOR}
          onChanged={reload}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function FlowScreen({
  snapshot,
  bucId,
  violations,
  selectedId,
  onSelect,
}: {
  snapshot: Snapshot;
  bucId: string;
  violations: ReturnType<typeof validateModel>;
  selectedId: string | null;
  onSelect: (elementId: string) => void;
}) {
  const view = useMemo(
    () =>
      businessFlowView(
        snapshot.elements,
        bucId,
        snapshot.layouts.find((l) => l.bucId === bucId),
        violations,
      ),
    [snapshot, bucId, violations],
  );
  if (!view) return <p className="error">業務フローが見つかりません。</p>;
  return (
    <BusinessFlow view={view} selectedId={selectedId} onSelect={onSelect} />
  );
}
