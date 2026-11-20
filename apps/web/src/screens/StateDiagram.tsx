import { ELEMENT_KIND_LABELS, type ElementSnapshot } from "@sujigaki/domain";
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import { useMemo } from "react";
import { FLOW_ARIA_LABELS, nodeLabel } from "../components/flow-labels.ts";
import { ReviewStateMark } from "../components/status.tsx";
import {
  type StateDiagramNode,
  stateDiagram,
  stateModels,
} from "../model/state-diagram.ts";
import { hrefOf } from "../route.ts";

const COLUMN_WIDTH = 240;
const ROW_HEIGHT = 96;

type StateFlowNode = Node<{ node: StateDiagramNode }, "state">;

/** 状態は角の丸い枠、システム操作は四角い破線の枠で描き、種類の表示名も添える（画面設計書 5章） */
function StateNodeView({ data }: NodeProps<StateFlowNode>) {
  const { node } = data;
  const isState = node.element.kind === "state";
  return (
    <div
      className={isState ? "state-node" : "state-node state-usecase"}
      data-testid="state-node"
    >
      <Handle type="target" position={Position.Left} id="in" />
      {/* 前の列へ戻る線は、カードの下からつなぐ（#157） */}
      <Handle type="target" position={Position.Bottom} id="back-in" />
      <div className="chain-head">
        <span className="muted">{ELEMENT_KIND_LABELS[node.element.kind]}</span>
        <ReviewStateMark state={node.element.reviewState} withText={false} />
      </div>
      <div className="activity-name">{node.element.name}</div>
      {(node.start || node.end) && (
        <div className="state-tags">
          {node.start && <span className="tag">始まり</span>}
          {node.end && <span className="tag">終わり</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} id="out" />
      <Handle type="source" position={Position.Bottom} id="back-out" />
    </div>
  );
}

const nodeTypes = { state: StateNodeView };

/**
 * S-14 状態遷移図（#129）。状態の流れの状態と、そのあいだの遷移を向きのある線で描く。
 * 状態とシステム操作のつながりは、システム操作を状態のあいだに置いて描く
 */
export function StateDiagramScreen({
  elements,
  modelId,
  selectedId,
  onSelect,
  onChangeModel,
}: {
  elements: readonly ElementSnapshot[];
  /** null なら、名前の順で最初の状態の流れを出す */
  modelId: string | null;
  selectedId: string | null;
  onSelect: (elementId: string) => void;
  onChangeModel: (modelId: string) => void;
}) {
  const models = stateModels(elements);
  const chosen = modelId ?? models[0]?.id ?? null;
  const diagram = useMemo(
    () => (chosen ? stateDiagram(elements, chosen) : null),
    [elements, chosen],
  );

  const { nodes, edges } = useMemo(() => {
    if (!diagram) return { nodes: [] as Node[], edges: [] as Edge[] };
    const flowNodes: StateFlowNode[] = diagram.nodes.map((node) => ({
      id: node.element.id,
      type: "state",
      ariaLabel: nodeLabel(node.element),
      position: { x: node.column * COLUMN_WIDTH, y: node.row * ROW_HEIGHT },
      data: { node },
      draggable: false,
      selected: node.element.id === selectedId,
    }));
    const columnOf = new Map(
      diagram.nodes.map((n) => [n.element.id as string, n.column]),
    );
    const flowEdges: Edge[] = diagram.edges.map(({ from, to }) => {
      // 前の列や同じ列へ戻る線は、カードの下を回して、カードの後ろを通らないようにする（#157）
      const back = (columnOf.get(to) ?? 0) <= (columnOf.get(from) ?? 0);
      return {
        id: `${from}-${to}`,
        source: from,
        target: to,
        sourceHandle: back ? "back-out" : "out",
        targetHandle: back ? "back-in" : "in",
        ...(back && { type: "smoothstep", pathOptions: { offset: 28 } }),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 18,
          height: 18,
          color: "#6e7781",
        },
        style: { strokeWidth: 2, stroke: "#6e7781" },
      };
    });
    return { nodes: flowNodes as Node[], edges: flowEdges };
  }, [diagram, selectedId]);

  if (models.length === 0 && modelId === null)
    return (
      <section className="screen">
        <h1>状態遷移図</h1>
        <p className="empty">
          状態の流れがありません。
          <a href={hrefOf({ screen: "elements", kind: "stateModel" })}>
            要素の一覧
          </a>
          で状態の流れを追加できます。
        </p>
      </section>
    );

  if (!diagram)
    return (
      <section className="screen">
        <h1>状態遷移図</h1>
        <p className="error" role="alert">
          状態の流れが見つかりません。削除された可能性があります。
        </p>
        <p>
          <a href={hrefOf({ screen: "states", modelId: null })}>
            最初の状態の流れを見る
          </a>
          {"　"}
          <a href={hrefOf({ screen: "deleted" })}>削除済みの要素を見る</a>
        </p>
      </section>
    );

  return (
    <section className="screen screen-flow">
      <h1>状態遷移図: {diagram.model.name}</h1>
      <div className="board-filters chain-controls">
        <label>
          状態の流れ{" "}
          <select
            value={diagram.model.id}
            onChange={(e) => onChangeModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="link"
          onClick={() => onSelect(diagram.model.id)}
        >
          状態の流れの詳細を開く
        </button>
      </div>
      {diagram.nodes.length === 0 ? (
        <p className="empty">
          状態がありません。状態の流れの詳細パネルの「＋
          つなぐ」で状態を加えてください。
        </p>
      ) : (
        <div
          className="flow-canvas"
          // 図が低いときは枠も低くし、上下に大きな余白を作らない（#156）
          style={{
            flex: "0 1 auto",
            minHeight: 240,
            height:
              (Math.max(0, ...diagram.nodes.map((n) => n.row)) + 1) *
                ROW_HEIGHT +
              160,
          }}
        >
          <ReactFlow
            ariaLabelConfig={FLOW_ARIA_LABELS}
            // 図の部品の色を、OS の明るさの設定に合わせる（#162）
            colorMode="system"
            // 状態の流れや詳細パネルの開閉で描く範囲が変わるため、描き直して全体が入るように合わせる
            key={`${diagram.model.id}-${selectedId === null}`}
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
      )}
    </section>
  );
}
