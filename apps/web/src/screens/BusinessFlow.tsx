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
import {
  ModeMark,
  ReviewStateMark,
  ViolationMark,
} from "../components/status.tsx";
import {
  type ActivityCard,
  type BusinessFlowView,
  COLUMN_WIDTH,
  LANE_HEIGHT,
} from "../model/business-flow.ts";

const CARD_WIDTH = 190;
const LANE_LABEL_WIDTH = 120;

type LaneNode = Node<{ name: string; width: number }, "lane">;
type ActivityNode = Node<{ card: ActivityCard }, "activity">;

function LaneView({ data }: NodeProps<LaneNode>) {
  return (
    <div className="lane" style={{ width: data.width, height: LANE_HEIGHT }}>
      <div className="lane-name" style={{ width: LANE_LABEL_WIDTH }}>
        {data.name}
      </div>
    </div>
  );
}

function ActivityView({ data, selected }: NodeProps<ActivityNode>) {
  const { card } = data;
  return (
    <div
      className={`activity activity-${card.mode ?? "unknown"}${selected ? " activity-selected" : ""}`}
      style={{ width: CARD_WIDTH }}
      data-testid="activity-card"
    >
      <Handle type="target" position={Position.Left} />
      <div className="activity-head">
        <ModeMark mode={card.mode} />
        <span className="activity-marks">
          <ViolationMark violations={card.violations} />
          <ReviewStateMark state={card.element.reviewState} withText={false} />
        </span>
      </div>
      <div className="activity-name">{card.element.name}</div>
      {card.usecases.length > 0 && (
        <div className="activity-usecases">{card.usecases.join("、")}</div>
      )}
      {card.badges.length > 0 && (
        <div className="activity-badges">
          {card.badges.map((b) => (
            <span key={b.label} className="badge">
              {b.label} {b.count}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { lane: LaneView, activity: ActivityView };

/** S-04 業務フロー。担当者ごとのレーンに、活動を流れの順に並べる（FR-020） */
export function BusinessFlow({
  view,
  selectedId,
  onSelect,
}: {
  view: BusinessFlowView;
  selectedId: string | null;
  onSelect: (elementId: string) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const right =
      Math.max(0, ...view.cards.map((c) => c.position.x)) + COLUMN_WIDTH + 80;
    const lanes: LaneNode[] = view.lanes.map((lane, index) => ({
      id: `lane-${index}`,
      type: "lane",
      position: { x: -LANE_LABEL_WIDTH - 20, y: index * LANE_HEIGHT },
      data: { name: lane.name, width: right + LANE_LABEL_WIDTH + 20 },
      draggable: false,
      selectable: false,
      zIndex: -1,
    }));
    const cards: ActivityNode[] = view.cards.map((card) => ({
      id: card.element.id,
      type: "activity",
      position: { x: card.position.x, y: card.position.y + 16 },
      data: { card },
      draggable: false,
      selected: card.element.id === selectedId,
    }));
    const flowEdges: Edge[] = view.edges.map((e) => ({
      id: `${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      markerEnd: { type: MarkerType.ArrowClosed },
    }));
    return { nodes: [...lanes, ...cards] as Node[], edges: flowEdges };
  }, [view, selectedId]);

  return (
    <section className="screen screen-flow">
      <h1>業務フロー: {view.buc.name}</h1>
      {view.cards.length === 0 && (
        <p className="empty">活動がありません。活動を追加してください。</p>
      )}
      <div className="flow-canvas">
        <ReactFlow
          // 詳細パネルを開くと図の幅が変わるため、描き直して全体が入るように合わせる
          key={selectedId === null ? "full" : "with-panel"}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          nodesConnectable={false}
          onNodeClick={(_, node) => {
            if (node.type === "activity") onSelect(node.id);
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
}
