import {
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  createContext,
  type FormEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
/** クリックとダブルクリックを見分けるために待つミリ秒 */
const DOUBLE_CLICK_MS = 250;
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
      <ActivityName card={card} />
      {card.usecases.length > 0 && (
        <div className="activity-usecases">{card.usecases.join("、")}</div>
      )}
      {(card.badges.length > 0 || card.openQuestions > 0) && (
        <div className="activity-badges">
          {card.openQuestions > 0 && (
            <span className="badge badge-question">
              問い {card.openQuestions}
            </span>
          )}
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

/**
 * カードの名前を直す操作。カードのデータに入れると、操作が変わるたびにカードを描き直して位置が戻るため、
 * 変わらない関数をコンテキストで渡す。編集できないときは null
 */
const RenameContext = createContext<
  ((elementId: string, name: string) => void) | null
>(null);

/** カードの名前。編集できるときは、ダブルクリックでその場の入力欄にする（US-001） */
function ActivityName({ card }: { card: ActivityCard }) {
  const rename = useContext(RenameContext);
  const [draft, setDraft] = useState<string | null>(null);
  const name = card.element.name;
  if (draft === null) {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: ダブルクリックはマウスでの近道で、キーボードでは詳細パネルの名前の欄で直す（画面設計書 S-04）
      <div
        className="activity-name"
        onDoubleClick={(event) => {
          if (!rename) return;
          event.stopPropagation();
          setDraft(name);
        }}
      >
        {name}
      </div>
    );
  }
  const commit = () => {
    const next = draft.trim();
    setDraft(null);
    if (next !== "" && next !== name) rename?.(card.element.id, next);
  };
  return (
    <input
      className="activity-name-input nodrag"
      aria-label={`活動「${name}」の名前`}
      value={draft}
      // biome-ignore lint/a11y/noAutofocus: ダブルクリックで開いた入力欄に、そのまま入力できるようにする
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
      onBlur={commit}
    />
  );
}

const nodeTypes = { lane: LaneView, activity: ActivityView };

/** S-04 業務フロー。担当者ごとのレーンに、活動を流れの順に並べる（FR-020） */
/** 活動を分ける目安（FR-002）。活動を追加する入力欄の近くに出す */
const SPLIT_HINTS = [
  "担当者や判断する人が変わる所",
  "待ちが発生する所",
  "区分（手作業とシステム利用）が変わる所",
];

export interface FlowEditing {
  /** 活動を追加する。actorId はレーンの担当者。担当者が未設定のレーンは null */
  readonly onAdd: (actorId: string | null, name: string) => Promise<void>;
  /** カードを横に動かした */
  readonly onMove: (elementId: string, x: number) => void;
  /** カードの端から別のカードへつないだ */
  readonly onConnect: (from: string, to: string) => void;
  /** カードの名前をその場で直した（US-001） */
  readonly onRename: (elementId: string, name: string) => void;
  /** 保存した位置を捨てて、自動の配置で並べ直す（#111） */
  readonly onRelayout: () => Promise<void>;
}

/**
 * S-04 業務フロー。担当者ごとのレーンに、活動を流れの順に並べる（FR-020）。
 * editing を渡すと、活動の追加・カードの移動・流れの順のつなぎができる
 */
export function BusinessFlow({
  view,
  selectedId,
  onSelect,
  editing,
}: {
  view: BusinessFlowView;
  selectedId: string | null;
  onSelect: (elementId: string) => void;
  editing?: FlowEditing;
}) {
  // 編集の操作は描くたびに作り直されるため、編集できるかどうかだけで描き直しを決める。
  // 描き直すとカードの位置が戻り、ドラッグの途中で動きが止まるためである
  const editable = editing !== undefined;
  const initial = useMemo(() => {
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
      draggable: editable,
      selected: card.element.id === selectedId,
    }));
    return [...lanes, ...cards] as Node[];
  }, [view, selectedId, editable]);
  const [nodes, setNodes] = useState<Node[]>(initial);
  // 詳細パネルを開け閉めすると図の幅が変わるため、表示の範囲を合わせ直す。
  // 図を作り直すと、ダブルクリックの途中でカードが入れ替わり、名前を直せないためである
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const panelOpen = selectedId !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: パネルを開け閉めしたときに合わせ直すため、panelOpen の変化で動かす
  useEffect(() => {
    if (!flow) return;
    const timer = window.setTimeout(() => void flow.fitView(), 50);
    return () => window.clearTimeout(timer);
  }, [flow, panelOpen]);
  // 編集できるときは、クリックでパネルを開くのを少し待つ。開くと図がずれ、ダブルクリックの2回目が別の場所に当たるためである
  const clickTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);
  const renameRef = useRef(editing?.onRename);
  renameRef.current = editing?.onRename;
  const rename = useCallback(
    (elementId: string, name: string) => renameRef.current?.(elementId, name),
    [],
  );
  useEffect(() => setNodes(initial), [initial]);

  const edges: Edge[] = useMemo(
    () =>
      view.edges.map((e) => ({
        id: `${e.from}-${e.to}`,
        source: e.from,
        target: e.to,
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    [view],
  );

  // カードは横にだけ動かす。縦の位置は担当者のレーンで決まるため
  const onNodesChange = (changes: NodeChange[]) =>
    setNodes((current) =>
      applyNodeChanges(
        changes.map((change) => {
          if (change.type !== "position" || !change.position) return change;
          const node = current.find((n) => n.id === change.id);
          return node
            ? {
                ...change,
                position: { x: change.position.x, y: node.position.y },
              }
            : change;
        }),
        current,
      ),
    );

  return (
    <section className="screen screen-flow">
      <h1>業務フロー: {view.buc.name}</h1>
      {editing && (
        <div className="flow-tools">
          <AddActivityForm lanes={view.lanes} onAdd={editing.onAdd} />
          <button
            type="button"
            className="relayout"
            onClick={async () => {
              await editing.onRelayout();
              // 並べ直したカードが図に収まるよう、表示の範囲を合わせ直す
              window.setTimeout(() => void flow?.fitView(), 100);
            }}
          >
            自動で並べ直す
          </button>
        </div>
      )}
      {view.cards.length === 0 && (
        <p className="empty">活動がありません。活動を追加してください。</p>
      )}
      <div className="flow-canvas">
        <RenameContext.Provider value={editable ? rename : null}>
          <ReactFlow
            nodes={nodes}
            onInit={setFlow}
            // ダブルクリックはカードの名前を直すのに使うため、図の拡大には使わない
            zoomOnDoubleClick={false}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            onNodesChange={onNodesChange}
            nodesConnectable={editing !== undefined}
            onConnect={(connection: Connection) => {
              if (connection.source !== connection.target) {
                editing?.onConnect(connection.source, connection.target);
              }
            }}
            onNodeDragStop={(_, node) => {
              if (node.type === "activity")
                editing?.onMove(node.id, node.position.x);
            }}
            onNodeClick={(event, node) => {
              if (node.type !== "activity") return;
              if (!editable) {
                onSelect(node.id);
                return;
              }
              window.clearTimeout(clickTimer.current);
              // ダブルクリックの2回目なら、パネルを開かずに名前を直す
              if (event.detail >= 2) return;
              clickTimer.current = window.setTimeout(
                () => onSelect(node.id),
                DOUBLE_CLICK_MS,
              );
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </RenameContext.Provider>
      </div>
    </section>
  );
}

function AddActivityForm({
  lanes,
  onAdd,
}: {
  lanes: BusinessFlowView["lanes"];
  onAdd: FlowEditing["onAdd"];
}) {
  const [lane, setLane] = useState("0");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;
    setBusy(true);
    try {
      await onAdd(lanes[Number(lane)]?.actorId ?? null, name);
      setName("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="add-activity" onSubmit={submit} aria-label="活動を追加">
      <label>
        担当{" "}
        <select value={lane} onChange={(e) => setLane(e.target.value)}>
          {lanes.map((l, index) => (
            <option key={l.actorId ?? "none"} value={String(index)}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        活動の名前{" "}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="submit" disabled={busy || name.trim() === ""}>
        ＋ 活動を追加
      </button>
      <p className="hint">活動を分ける目安: {SPLIT_HINTS.join("、")}</p>
    </form>
  );
}
