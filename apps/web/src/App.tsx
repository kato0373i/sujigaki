import { type Actor, can, validateModel } from "@sujigaki/domain";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addRelation,
  createElement,
  fetchSnapshot,
  LOCAL_PROJECT_ID,
  type Snapshot,
  saveLayout,
} from "./api.ts";
import { ElementPanel } from "./components/ElementPanel.tsx";
import { businessFlowView, positionsAfterMove } from "./model/business-flow.ts";
import { businessListView } from "./model/business-list.ts";
import { defaultFilter } from "./model/review-board.ts";
import { hrefOf, useRoute } from "./route.ts";
import { AiExchange } from "./screens/AiExchange.tsx";
import { BusinessFlow, type FlowEditing } from "./screens/BusinessFlow.tsx";
import { BusinessList } from "./screens/BusinessList.tsx";
import { ChainViewScreen } from "./screens/ChainView.tsx";
import { DeletedElements } from "./screens/DeletedElements.tsx";
import { ImportExport } from "./screens/ImportExport.tsx";
import { ProjectSettingsScreen } from "./screens/ProjectSettingsScreen.tsx";
import { ReviewBoard } from "./screens/ReviewBoard.tsx";
import { TraceTable } from "./screens/TraceTable.tsx";

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
    route.screen === "flow" ||
    route.screen === "board" ||
    route.screen === "trace" ||
    route.screen === "chain"
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
        <a
          href={hrefOf({ screen: "trace" })}
          className="nav-top"
          aria-current={route.screen === "trace" ? "page" : undefined}
        >
          トレース表
        </a>
        <a
          href={hrefOf({ screen: "ai" })}
          className="nav-top"
          aria-current={route.screen === "ai" ? "page" : undefined}
        >
          AI 連携
        </a>
        <a
          href={hrefOf({ screen: "io" })}
          className="nav-top"
          aria-current={route.screen === "io" ? "page" : undefined}
        >
          読み込みと書き出し
        </a>
        <a
          href={hrefOf({ screen: "deleted" })}
          className="nav-top"
          aria-current={route.screen === "deleted" ? "page" : undefined}
        >
          削除済みの要素
        </a>
        {can(LOCAL_ACTOR, "configureProject") && (
          <a
            href={hrefOf({ screen: "settings" })}
            className="nav-top"
            aria-current={route.screen === "settings" ? "page" : undefined}
          >
            プロジェクトの設定
          </a>
        )}
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
        {snapshot && route.screen === "chain" && (
          <ChainViewScreen
            elements={snapshot.elements}
            originId={route.originId}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
        {snapshot && route.screen === "trace" && (
          <TraceTable elements={snapshot.elements} onSelect={setSelectedId} />
        )}
        {snapshot && route.screen === "ai" && (
          <AiExchange
            projectId={LOCAL_PROJECT_ID}
            snapshot={snapshot}
            selected={snapshot.elements.find((e) => e.id === selectedId)}
            onChanged={reload}
          />
        )}
        {snapshot && route.screen === "io" && (
          <ImportExport
            projectId={LOCAL_PROJECT_ID}
            snapshot={snapshot}
            actor={LOCAL_ACTOR}
            onChanged={reload}
          />
        )}
        {snapshot && route.screen === "deleted" && (
          <DeletedElements
            projectId={LOCAL_PROJECT_ID}
            actor={LOCAL_ACTOR}
            onChanged={reload}
          />
        )}
        {snapshot && route.screen === "settings" && (
          <ProjectSettingsScreen
            projectId={LOCAL_PROJECT_ID}
            settings={snapshot.project}
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
            onChanged={reload}
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
  onChanged,
}: {
  snapshot: Snapshot;
  bucId: string;
  violations: ReturnType<typeof validateModel>;
  selectedId: string | null;
  onSelect: (elementId: string) => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const layout = snapshot.layouts.find((l) => l.bucId === bucId);
  const view = useMemo(
    () => businessFlowView(snapshot.elements, bucId, layout, violations),
    [snapshot, bucId, layout, violations],
  );

  /** 編集の操作を行い、終わったら読み直す。失敗したら理由を出す */
  const attempt = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      onChanged();
    }
  };

  const editing: FlowEditing | undefined =
    view && can(LOCAL_ACTOR, "editElement")
      ? {
          // 活動を作り、業務フローの子にして、レーンの担当者につなぐ
          onAdd: (actorId, name) =>
            attempt(async () => {
              const created = await createElement(LOCAL_PROJECT_ID, {
                kind: "activity",
                name,
              });
              await addRelation(LOCAL_PROJECT_ID, view.buc, created.id);
              if (actorId)
                await addRelation(LOCAL_PROJECT_ID, created, actorId);
            }),
          onMove: (elementId, x) =>
            void attempt(() =>
              saveLayout(
                LOCAL_PROJECT_ID,
                bucId,
                layout?.version ?? 0,
                positionsAfterMove(view, elementId, x),
              ),
            ),
          onConnect: (from, to) => {
            const source = snapshot.elements.find((e) => e.id === from);
            if (source)
              void attempt(() => addRelation(LOCAL_PROJECT_ID, source, to));
          },
        }
      : undefined;

  if (!view) return <p className="error">業務フローが見つかりません。</p>;
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <BusinessFlow
        view={view}
        selectedId={selectedId}
        onSelect={onSelect}
        {...(editing && { editing })}
      />
    </>
  );
}
