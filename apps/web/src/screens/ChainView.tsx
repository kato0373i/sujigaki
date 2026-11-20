import {
  ELEMENT_KIND_LABELS,
  ELEMENT_KINDS,
  type ElementKind,
  type ElementSnapshot,
} from "@sujigaki/domain";
import {
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { FLOW_ARIA_LABELS, nodeLabel } from "../components/flow-labels.ts";
import { ReviewStateMark } from "../components/status.tsx";
import {
  type ChainNode,
  chainView,
  highlightedPath,
  MAX_NODES,
  VIEW_PRESETS,
  type ViewPreset,
} from "../model/chain-view.ts";
import {
  choosePreset,
  loadViewSettings,
  saveViewSettings,
  toggleKind,
  type ViewSettings,
} from "../model/view-settings.ts";
import { hrefOf } from "../route.ts";

const COLUMN_WIDTH = 230;
/** 行の間隔。バッジが2行に折り返したカードでも重ならない高さにする */
const ROW_HEIGHT = 124;

type ChainFlowNode = Node<
  {
    node: ChainNode;
    highlighted: boolean;
    origin: boolean;
    onShowKind: (kind: ElementKind) => void;
  },
  "chain"
>;

function ChainNodeView({ data }: NodeProps<ChainFlowNode>) {
  const { node, highlighted, origin, onShowKind } = data;
  return (
    <div
      className={`chain-node${highlighted ? " chain-highlighted" : ""}${origin ? " chain-origin" : ""}`}
      data-testid="chain-node"
    >
      <Handle type="target" position={Position.Left} />
      <div className="chain-head">
        <span className="muted">{ELEMENT_KIND_LABELS[node.element.kind]}</span>
        <ReviewStateMark state={node.element.reviewState} withText={false} />
      </div>
      <div className="activity-name">{node.element.name}</div>
      {node.stopped > 0 && (
        // つながりが多いため先をたどらなかった要素は、この要素を起点に開いて見る（#151）
        <a
          className="badge badge-stopped nodrag"
          href={hrefOf({ screen: "chain", originId: node.element.id })}
          title={`「${node.element.name}」を起点に開く`}
          onClick={(event) => event.stopPropagation()}
        >
          ほか {node.stopped}件
        </a>
      )}
      {node.hidden.length > 0 && (
        <div className="activity-badges">
          {node.hidden.map((h) => (
            <button
              key={h.kind}
              type="button"
              className="badge nodrag"
              title={`「${h.label}」も表示する`}
              onClick={(event) => {
                event.stopPropagation();
                onShowKind(h.kind);
              }}
            >
              {h.label} {h.count}
            </button>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { chain: ChainNodeView };

/**
 * S-05 連鎖ビュー（FR-021）。起点から前後に指定した段数までのつながりを、種類ごとの列に並べて描く。
 * 選んだ要素から要求までの経路と、画面・情報までの経路を太線で強調する
 */
export function ChainViewScreen({
  elements,
  originId,
  selectedId,
  onSelect,
}: {
  elements: readonly ElementSnapshot[];
  originId: string;
  selectedId: string | null;
  onSelect: (elementId: string) => void;
}) {
  const [settings, setSettings] = useState<ViewSettings>(() =>
    loadViewSettings(globalThis.localStorage),
  );
  useEffect(
    () => saveViewSettings(globalThis.localStorage, settings),
    [settings],
  );
  const visible = useMemo(() => new Set(settings.kinds), [settings.kinds]);
  const view = useMemo(
    () => chainView(elements, originId, settings.depth, visible),
    [elements, originId, settings.depth, visible],
  );

  const { nodes, edges, rows } = useMemo(() => {
    if (!view) return { nodes: [] as Node[], edges: [] as Edge[], rows: 0 };
    const focus =
      selectedId && view.nodes.some((n) => n.element.id === selectedId)
        ? selectedId
        : originId;
    const path = highlightedPath(view, focus);
    const rowsInColumn = new Map<number, number>();
    const showKind = (kind: ElementKind) =>
      setSettings((s) => toggleKind(s, kind));
    const flowNodes: ChainFlowNode[] = view.nodes.map((node) => {
      const row = rowsInColumn.get(node.column) ?? 0;
      rowsInColumn.set(node.column, row + 1);
      return {
        id: node.element.id,
        type: "chain",
        ariaLabel: nodeLabel(node.element),
        position: { x: node.column * COLUMN_WIDTH, y: row * ROW_HEIGHT },
        data: {
          node,
          highlighted: path.nodes.has(node.element.id),
          origin: node.element.id === originId,
          onShowKind: showKind,
        },
        draggable: false,
        selected: node.element.id === selectedId,
      };
    });
    const columnOfNode = new Map(
      view.nodes.map((n) => [n.element.id as string, n.column]),
    );
    // 同じ列の中のつながり（活動の流れの順など）は、層をまたぐ追跡の邪魔になるため描かない
    const crossing = view.edges.filter(
      ({ from, to }) => columnOfNode.get(from) !== columnOfNode.get(to),
    );
    const flowEdges: Edge[] = crossing.map(({ from, to }) => {
      const highlighted = path.edges.has(`${from}\n${to}`);
      // 左の列から右の列へ線を引く
      const [source, target] =
        (view.nodes.find((n) => n.element.id === from)?.column ?? 0) <=
        (view.nodes.find((n) => n.element.id === to)?.column ?? 0)
          ? [from, to]
          : [to, from];
      return {
        id: `${from}-${to}`,
        source,
        target,
        ...(highlighted && { className: "chain-edge-highlighted" }),
        style: highlighted
          ? { strokeWidth: 3, stroke: "var(--accent)" }
          : { strokeWidth: 1, stroke: "#8c959f" },
      };
    });
    return {
      nodes: flowNodes as Node[],
      edges: flowEdges,
      rows: Math.max(0, ...rowsInColumn.values()),
    };
  }, [view, selectedId, originId]);

  if (!view)
    return (
      <section className="screen">
        <p className="error" role="alert">
          起点の要素が見つかりません。削除された可能性があります。
        </p>
        {/* 戻る先を出す（#124） */}
        <p>
          <a href={hrefOf({ screen: "businesses" })}>業務一覧へ戻る</a>
          {"　"}
          <a href={hrefOf({ screen: "deleted" })}>削除済みの要素を見る</a>
        </p>
      </section>
    );

  return (
    <section className="screen screen-flow">
      <h1>
        連鎖ビュー: {ELEMENT_KIND_LABELS[view.origin.kind]}「{view.origin.name}
        」
      </h1>
      <div className="board-filters chain-controls">
        <label>
          前後{" "}
          <select
            value={settings.depth}
            onChange={(e) =>
              setSettings({ ...settings, depth: Number(e.target.value) })
            }
          >
            {[1, 2, 3, 4].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>{" "}
          段
        </label>
        <label>
          表示{" "}
          <select
            value={settings.preset}
            onChange={(e) => {
              const preset = e.target.value;
              if (preset !== "custom")
                setSettings(choosePreset(settings, preset as ViewPreset));
            }}
          >
            {(Object.keys(VIEW_PRESETS) as ViewPreset[]).map((p) => (
              <option key={p} value={p}>
                {VIEW_PRESETS[p].label}
              </option>
            ))}
            {settings.preset === "custom" && (
              <option value="custom">カスタム</option>
            )}
          </select>
        </label>
        <details className="kind-picker">
          <summary>種類</summary>
          <fieldset>
            <legend className="visually-hidden">表示する種類</legend>
            {ELEMENT_KINDS.map((kind) => (
              <label key={kind}>
                <input
                  type="checkbox"
                  checked={visible.has(kind)}
                  onChange={() => setSettings(toggleKind(settings, kind))}
                />{" "}
                {ELEMENT_KIND_LABELS[kind]}
              </label>
            ))}
          </fieldset>
        </details>
      </div>
      {view.nodes.length === 1 && (
        <p className="empty">つながっている要素はありません。</p>
      )}
      {view.omitted > 0 && (
        <p className="notice" role="status">
          ほかに {view.omitted} 件あります（{MAX_NODES}
          件まで描いています）。段数を減らすか、表示する種類を絞ってください。
        </p>
      )}
      <div
        className="flow-canvas"
        // 図が低いときは枠も低くし、上下に大きな余白を作らない（#156）
        style={{
          flex: "0 1 auto",
          minHeight: 240,
          height: rows * ROW_HEIGHT + 120,
        }}
      >
        <ReactFlow
          ariaLabelConfig={FLOW_ARIA_LABELS}
          // 段数や表示する種類、詳細パネルの開閉で描く範囲が変わるため、描き直して全体が入るように合わせる
          key={`${originId}-${settings.depth}-${settings.kinds.join()}-${selectedId === null}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          // 小さな図は少し大きく描き、文字を読みやすくする（#156）
          fitViewOptions={{ maxZoom: 1.25, padding: 0.08 }}
          nodesConnectable={false}
          onNodeClick={(_, node) => onSelect(node.id)}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
}
