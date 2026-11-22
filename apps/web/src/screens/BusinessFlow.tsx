import { type ElementSnapshot, REVIEW_STATES } from "@sujigaki/domain";
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
  useViewport,
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
import { FLOW_ARIA_LABELS, nodeLabel } from "../components/flow-labels.ts";
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
import { hrefOf } from "../route.ts";

const CARD_WIDTH = 190;
/**
 * 図全体を収めるときの倍率。カードの文字が読めなくなるほどは縮めない（#119）。
 * 収まらない分はドラッグやホイールで動かして見る
 */
const FIT_OPTIONS = { minZoom: 0.8, maxZoom: 1.25, padding: 0.08 };
/** クリックとダブルクリックを見分けるために待つミリ秒 */
const DOUBLE_CLICK_MS = 250;
const LANE_LABEL_WIDTH = 120;
/**
 * 図の全体を枠に合わせる。カードがレーンの名前の下に隠れないよう、図の左端をレーンの名前の右にそろえ、
 * 残りの幅に収まる倍率にする。文字が読めなくなるほどは縮めない（#144）
 */
async function fitFlow(flow: ReactFlowInstance, canvas: HTMLElement | null) {
  await flow.fitView(FIT_OPTIONS);
  const { x, zoom } = flow.getViewport();
  // 帯の左の空き（名前の分の幅）の右端が、重ねた名前の右端に来る位置
  if (!canvas || x >= LANE_LABEL_WIDTH + 20 * zoom) return;
  const bounds = flow.getNodesBounds(flow.getNodes());
  // 帯の左の空きの右端（x = -20）から、図の右端までの幅
  const span = bounds.x + bounds.width + 20;
  const room = canvas.clientWidth - LANE_LABEL_WIDTH - 16;
  const fitted = Math.max(FIT_OPTIONS.minZoom, Math.min(zoom, room / span));
  await flow.setViewport({
    x: LANE_LABEL_WIDTH + 20 * fitted,
    // 縦は図の真ん中を枠の真ん中に合わせる
    y: canvas.clientHeight / 2 - (bounds.y + bounds.height / 2) * fitted,
    zoom: fitted,
  });
}

/** 流れの線の色。矢印の色と合わせるため値で持ち、明るさの設定のどちらでも読める灰色にする */
const EDGE_COLOR = "#6e7781";

type LaneNode = Node<{ width: number }, "lane">;
type ActivityNode = Node<{ card: ActivityCard }, "activity">;

/** レーンの帯。名前は LaneLabels で図の左に重ねて出す。帯の左には名前の分の幅を空けておく */
function LaneView({ data }: NodeProps<LaneNode>) {
  return (
    <div className="lane" style={{ width: data.width, height: LANE_HEIGHT }}>
      <div className="lane-spacer" style={{ width: LANE_LABEL_WIDTH }} />
    </div>
  );
}

/**
 * レーンの名前。図を横に動かしたり、幅が狭くて図の左が切れたりしても見えるよう、図の左端に重ねて出す（#144）。
 * 縦の位置と高さは、図の表示の位置と倍率に合わせる
 */
function LaneLabels({ names }: { names: readonly string[] }) {
  const { y, zoom } = useViewport();
  return (
    <div className="lane-labels">
      {names.map((name, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: 同じ名前の担当者がいてもレーンは順で決まる
          key={index}
          className="lane-name"
          style={{
            top: y + index * LANE_HEIGHT * zoom,
            height: LANE_HEIGHT * zoom,
            width: LANE_LABEL_WIDTH,
          }}
        >
          {name}
        </div>
      ))}
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
/** 担当の選択肢の「＋ 新しい担当者」 */
const NEW_ACTOR = "new";
/** 担当者が未設定のレーンの選択肢の値 */
const NONE_LANE = "none";
const laneKey = (lane: { readonly actorId: string | null } | undefined) =>
  lane?.actorId ?? NONE_LANE;

const SPLIT_HINTS = [
  "担当者や判断する人が変わる所",
  "待ちが発生する所",
  "区分（手作業とシステム利用）が変わる所",
];

export interface FlowEditing {
  /**
   * 活動を追加する。actorId はレーンの担当者。担当者が未設定のレーンは null。
   * newActor を渡したときは、その名前の登場人物を作って担当者にする（#118）。
   * after を渡したときは、その活動の次に続ける（#147）。
   * 足せたら担当者と活動の ID を、足せなかったら failed を返す
   */
  readonly onAdd: (
    actorId: string | null,
    name: string,
    newActor?: string,
    after?: string | null,
  ) => Promise<
    | { readonly actorId: string | null; readonly activityId: string }
    | { readonly failed: true }
  >;
  /** カードを横に動かした */
  readonly onMove: (elementId: string, x: number) => void;
  /** カードの端から別のカードへつないだ */
  readonly onConnect: (from: string, to: string) => void;
  /** カードの名前をその場で直した（US-001） */
  readonly onRename: (elementId: string, name: string) => void;
  /** 保存した位置を捨てて、自動の配置で並べ直す（#111） */
  readonly onRelayout: () => Promise<unknown>;
}

/**
 * S-04 業務フロー。担当者ごとのレーンに、活動を流れの順に並べる（FR-020）。
 * editing を渡すと、活動の追加・カードの移動・流れの順のつなぎができる
 */
export function BusinessFlow({
  view,
  business = null,
  selectedId,
  onSelect,
  editing,
}: {
  view: BusinessFlowView;
  /** 業務フローが属する業務。パンくずに出す（#174） */
  business?: ElementSnapshot | null;
  selectedId: string | null;
  onSelect: (elementId: string) => void;
  editing?: FlowEditing;
}) {
  // 編集の操作は描くたびに作り直されるため、編集できるかどうかだけで描き直しを決める。
  // 描き直すとカードの位置が戻り、ドラッグの途中で動きが止まるためである
  const editable = editing !== undefined;
  // 担当者が未設定のレーンは、そこに活動があるときだけ描く（#158）
  const shownLanes = useMemo(
    () =>
      view.lanes.filter(
        (lane, index) =>
          lane.actorId !== null ||
          view.cards.some((c) => c.laneIndex === index),
      ),
    [view],
  );
  const initial = useMemo(() => {
    const right =
      Math.max(0, ...view.cards.map((c) => c.position.x)) + COLUMN_WIDTH + 80;
    const lanes: LaneNode[] = shownLanes.map((_, index) => ({
      id: `lane-${index}`,
      type: "lane",
      position: { x: -LANE_LABEL_WIDTH - 20, y: index * LANE_HEIGHT },
      data: { width: right + LANE_LABEL_WIDTH + 20 },
      draggable: false,
      selectable: false,
      zIndex: -1,
    }));
    const cards: ActivityNode[] = view.cards.map((card) => ({
      id: card.element.id,
      type: "activity",
      ariaLabel: nodeLabel(card.element),
      position: { x: card.position.x, y: card.position.y + 16 },
      data: { card },
      draggable: editable,
      selected: card.element.id === selectedId,
    }));
    return [...lanes, ...cards] as Node[];
  }, [view, shownLanes, selectedId, editable]);
  const [nodes, setNodes] = useState<Node[]>(initial);
  // 詳細パネルを開け閉めすると図の幅が変わるため、表示の範囲を合わせ直す。
  // 図を作り直すと、ダブルクリックの途中でカードが入れ替わり、名前を直せないためである
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panelOpen = selectedId !== null;
  const cardCount = view.cards.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: パネルの開け閉めと活動の数の変化で合わせ直すため、panelOpen と cardCount の変化で動かす
  useEffect(() => {
    if (!flow) return;
    const timer = window.setTimeout(
      () => void fitFlow(flow, canvasRef.current),
      50,
    );
    return () => window.clearTimeout(timer);
  }, [flow, panelOpen, cardCount]);
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
        // 流れの向きが読めるよう、線を太くして矢印を大きくする（#157）
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 18,
          height: 18,
          color: EDGE_COLOR,
        },
        style: { stroke: EDGE_COLOR, strokeWidth: 2 },
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
      <nav className="breadcrumb" aria-label="パンくずリスト">
        <ol>
          <li>
            <a href={hrefOf({ screen: "businesses" })}>業務一覧</a>
          </li>
          <li>{business?.name ?? "業務に属さない"}</li>
          <li aria-current="page">{view.buc.name}</li>
        </ol>
      </nav>
      <h1>業務フロー: {view.buc.name}</h1>
      {editing && (
        <div className="flow-tools">
          <AddActivityForm
            view={view}
            selectedId={selectedId}
            onAdd={editing.onAdd}
          />
          <button
            type="button"
            className="relayout"
            onClick={async () => {
              await editing.onRelayout();
              // 並べ直したカードが図に収まるよう、表示の範囲を合わせ直す
              window.setTimeout(
                () => flow && void fitFlow(flow, canvasRef.current),
                100,
              );
            }}
          >
            自動で並べ直す
          </button>
        </div>
      )}
      {view.cards.length === 0 && (
        <p className="empty">活動がありません。活動を追加してください。</p>
      )}
      <div
        ref={canvasRef}
        className="flow-canvas"
        // 図が低いときは枠も低くし、上下に大きな余白を作らない（#156）
        style={{
          flex: "0 1 auto",
          minHeight: 240,
          height: shownLanes.length * LANE_HEIGHT + 120,
        }}
      >
        <RenameContext.Provider value={editable ? rename : null}>
          <ReactFlow
            ariaLabelConfig={FLOW_ARIA_LABELS}
            // 図の部品の色を、OS の明るさの設定に合わせる（#162）
            colorMode="system"
            nodes={nodes}
            onInit={setFlow}
            // ダブルクリックはカードの名前を直すのに使うため、図の拡大には使わない
            zoomOnDoubleClick={false}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={FIT_OPTIONS}
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
            {/* 左下はレーンの名前と重なるため、右下に置く */}
            <Controls showInteractive={false} position="bottom-right" />
            <LaneLabels names={shownLanes.map((l) => l.name)} />
          </ReactFlow>
        </RenameContext.Provider>
      </div>
      <FlowLegend />
    </section>
  );
}

/** 図の凡例（#176）。カードの枠の種類と、右上の確認状態の印の意味を出す */
function FlowLegend() {
  return (
    <ul className="plain flow-legend" aria-label="凡例">
      <li className="legend-item">
        <span className="legend-card activity-manual" aria-hidden="true" />
        <ModeMark mode="manual" />
        の活動
      </li>
      <li className="legend-item">
        <span className="legend-card activity-system" aria-hidden="true" />
        <ModeMark mode="system" />
        の活動
      </li>
      <li className="legend-item">
        <span className="legend-card activity-unknown" aria-hidden="true" />
        区分が未設定
      </li>
      <li className="legend-item">
        右上の印:
        {REVIEW_STATES.map((state) => (
          <ReviewStateMark key={state} state={state} />
        ))}
      </li>
    </ul>
  );
}

/**
 * 次に足す活動を続ける先。最後に選んだか足した活動があればそれを、なければ流れの最後の活動を選ぶ。
 * 流れの最後は、次の活動のない活動のうち、いちばん右のもの
 */
function previousActivity(view: BusinessFlowView, anchor: string | null) {
  const anchored = view.cards.find((c) => c.element.id === anchor);
  if (anchored) return anchored.element;
  const ends = view.cards.filter(
    (c) => !view.edges.some((e) => e.from === c.element.id),
  );
  return (
    [...(ends.length > 0 ? ends : view.cards)].sort(
      (a, b) => b.position.x - a.position.x,
    )[0]?.element ?? null
  );
}

function AddActivityForm({
  view,
  selectedId,
  onAdd,
}: {
  view: BusinessFlowView;
  selectedId: string | null;
  onAdd: FlowEditing["onAdd"];
}) {
  const lanes = view.lanes;
  // 足した活動を、直前の活動の次に続ける（#147）
  const [follow, setFollow] = useState(true);
  // 続ける先。図で活動を選んだらその活動に、活動を足したら足した活動に移す（#177）
  const [anchor, setAnchor] = useState<string | null>(null);
  // 選び直したときだけ移す。足したあとの読み直しで、選んだままの活動に戻さないためである
  // biome-ignore lint/correctness/useExhaustiveDependencies: 選んだ活動が変わったときだけ動かすため、selectedId だけに依存させる
  useEffect(() => {
    if (selectedId && view.cards.some((c) => c.element.id === selectedId))
      setAnchor(selectedId);
  }, [selectedId]);
  const previous = previousActivity(view, anchor);
  // レーンは担当者の ID で覚える。担当者が増えるとレーンの順が変わるため、番号では覚えない（#143）
  const [chosen, setChosen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [actorName, setActorName] = useState("");
  // 追加しているあいだに送った活動は、前の追加が終わってから順に送る（#142）
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const lane =
    chosen === NEW_ACTOR || lanes.some((l) => laneKey(l) === chosen)
      ? (chosen as string)
      : laneKey(lanes[0]);
  const creatingActor = lane === NEW_ACTOR;
  const ready =
    name.trim() !== "" && (!creatingActor || actorName.trim() !== "");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    // 送った名前はすぐ欄から消す。足しているあいだに打った文字は残す（#142）
    const submitted = name.trim();
    const newActor = creatingActor ? actorName.trim() : undefined;
    const actorId = lanes.find((l) => laneKey(l) === lane)?.actorId ?? null;
    const after = follow ? (previous?.id ?? null) : null;
    setName("");
    const next = queue.current.then(async () => {
      const result = await onAdd(actorId, submitted, newActor, after);
      if ("failed" in result) {
        setName((current) => (current === "" ? submitted : current));
        return;
      }
      setAnchor(result.activityId);
      if (newActor !== undefined) {
        // 作った担当者を選んだままにして、続けて足せるようにする（#143）
        setActorName("");
        setChosen(result.actorId ?? NONE_LANE);
      }
    });
    queue.current = next;
    await next;
  };
  return (
    <form className="add-activity" onSubmit={submit} aria-label="活動を追加">
      <label>
        担当{" "}
        <select value={lane} onChange={(e) => setChosen(e.target.value)}>
          {lanes.map((l) => (
            <option key={laneKey(l)} value={laneKey(l)}>
              {l.name}
            </option>
          ))}
          <option value={NEW_ACTOR}>＋ 新しい担当者</option>
        </select>
      </label>
      {creatingActor && (
        <label>
          新しい担当者の名前{" "}
          <input
            value={actorName}
            onChange={(e) => setActorName(e.target.value)}
          />
        </label>
      )}
      <label>
        活動の名前{" "}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="submit" disabled={!ready}>
        ＋ 活動を追加
      </button>
      {previous && (
        <label className="follow">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />{" "}
          「{previous.name}」の次に続ける
        </label>
      )}
      {/* 目安はいつも出すと入力欄のまわりが長くなるため、押して開く（#181） */}
      <details className="hint">
        <summary>活動を分ける目安</summary>
        {SPLIT_HINTS.join("、")}
      </details>
    </form>
  );
}
