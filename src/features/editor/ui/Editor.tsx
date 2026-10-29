import { addEdge, Background, Controls, ReactFlow, type Connection, type Edge, type IsValidConnection, type NodeChange, type OnConnectEnd, type ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../app/api-client";
import { webNodes } from "../../../nodes/registry.web";
import type { PortDef } from "../../../shared/ports";
import { labelOf } from "../../../shared/node-label";
import { Banners } from "./Banners";
import { connectionProblem, droppedConnectionProblem, edgeKindClass, replaceTargetEdges, targetAcceptsMany } from "./graph-convert";
import { videoSecondsOf } from "./card-media";
import { portFor, type CatalogItem, type PortFilter } from "./catalog";
import { GraphNode, type FlowNode } from "./GraphNode";
import { GroupFrame } from "./GroupFrame";
import { addManualGroup, bundleEdges, GROUP_FRAME_TYPE, groupFrames, isFrame, measuredFrom, moveFramesTo, pruneEdgesFor, pruneManualGroups, reuseFrames } from "./groups";
import { COMPACT_ZOOM } from "./NodeCard";
import { Inspector, sourcesOf, type InspectorSources } from "./Inspector";
import { cardWidthOf, inheritProvider, placeNewNode } from "./new-node";
import { EditorContext, type EditorApi } from "./node-kit";
import { QueuePanel } from "./QueuePanel";
import { Rail } from "./Rail";
import { Spotlight, type ScreenPoint } from "./Spotlight";
import { TopBar } from "./TopBar";
import { useRun } from "./use-run";
import { useWorkflow } from "./use-workflow";

const EMPTY_SOURCES: InspectorSources = { nodes: [], edges: [] };

// Dây kéo từ cổng ra chỗ trống: thẻ mới nằm cách chỗ thả ngần này (đơn vị canvas) để thấy được đoạn dây.
const WIRE_GAP = 12;

type WireOrigin = { nodeId: string; handleId: string; dir: PortFilter["dir"] };
type SpotState = { at?: ScreenPoint; filter?: PortFilter; origin?: WireOrigin };
type Placement = { at?: ScreenPoint; wire?: { origin: WireOrigin; port: PortDef } };

const nodeTypes = { ...Object.fromEntries(Object.keys(webNodes).map((t) => [t, GraphNode])), [GROUP_FRAME_TYPE]: GroupFrame };

export function Editor() {
  const wf = useWorkflow();
  const run = useRun(wf);
  const { workflowId, nodes, edges, setNodes, setEdges, setProblem, latest, groups, groupList, setGroups } = wf;
  const { nodeStates, expandScenes } = run;
  const flow = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const isValidConnection: IsValidConnection<Edge> = useCallback((conn) => connectionProblem(conn, latest.current.nodes) === null, [latest]);

  // Nối hai cổng. `nodesNow` là danh sách node lúc nối (node vừa thêm từ ô tìm chưa nằm trong `latest`).
  const connect = useCallback(
    (conn: Connection, nodesNow: FlowNode[]) => {
      const why = connectionProblem(conn, nodesNow);
      if (why) {
        setProblem(why);
        return;
      }
      setProblem(null);
      const edge: Edge = {
        ...conn,
        id: `e-${conn.source}-${conn.sourceHandle}-${conn.target}-${conn.targetHandle}`,
        className: edgeKindClass(conn, nodesNow),
      };
      // Cổng thường chỉ nhận một dây (nối mới thay dây cũ); cổng multiple nhận thêm dây.
      const many = targetAcceptsMany(conn, nodesNow);
      setEdges((eds) => addEdge(edge, replaceTargetEdges(eds, conn, many)));
    },
    [setEdges, setProblem],
  );
  const onConnect = useCallback((conn: Connection) => connect(conn, latest.current.nodes), [connect, latest]);

  // Ô tìm node (Spotlight). `at` là toạ độ màn hình; `filter` + `origin` khi mở từ dây đang kéo (node chọn xong được nối vào `origin`).
  // Menu chuột phải (Task 6) mở ô này bằng `openSpotlight(toạ độ chuột)`.
  const [spot, setSpot] = useState<SpotState | null>(null);
  const spotOpen = useRef(false);
  spotOpen.current = spot !== null;
  const openSpotlight = useCallback((at?: ScreenPoint, filter?: PortFilter, origin?: WireOrigin) => setSpot({ at, filter, origin }), []);

  // Thả dây lên cổng không hợp: React Flow im lặng bỏ qua, ở đây nói rõ vì sao. Thả ra chỗ trống: mở ô tìm node tại chỗ thả,
  // chỉ liệt kê node có cổng hợp loại với cổng đang kéo.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      const from = state.fromHandle;
      if (state.isValid === true || !from) return;
      if (state.toHandle) {
        if (state.isValid === false) setProblem(droppedConnectionProblem(from, state.toHandle, latest.current.nodes));
        return;
      }
      if (!(event.target instanceof Element) || !event.target.classList.contains("react-flow__pane")) return;
      const dir: PortFilter["dir"] = from.type === "source" ? "out" : "in";
      const def = webNodes[latest.current.nodes.find((n) => n.id === from.nodeId)?.type ?? ""]?.definition;
      const port = (dir === "out" ? def?.outputs : def?.inputs)?.find((p) => p.name === from.id);
      const pointer = "changedTouches" in event ? event.changedTouches[0] : event;
      if (!port || !pointer) return;
      openSpotlight({ x: pointer.clientX, y: pointer.clientY }, { kind: port.kind, dir }, { nodeId: from.nodeId, handleId: port.name, dir });
    },
    [setProblem, latest, openSpotlight],
  );

  // Thêm một node vào canvas và chọn nó. Không có `at`: giữa vùng đang nhìn. Có `at` (toạ độ màn hình): đặt ở đó; kèm `wire` thì
  // thẻ nằm lệch ra phía cổng nhận (cách chỗ thả WIRE_GAP để thấy dây) và nối sẵn tới cổng `wire.port` của node mới.
  const insertNode = (type: string, placement: Placement, params?: Record<string, unknown>) => {
    const impl = webNodes[type];
    if (!impl) return;
    const existing = latest.current.nodes;
    const rect = canvasRef.current?.getBoundingClientRect();
    const view = flow.current;
    const dropped = placement.at && view ? view.screenToFlowPosition(placement.at) : null;
    const side = placement.wire ? (placement.wire.origin.dir === "out" ? 1 : -1) : 0;
    const center = dropped
      ? { x: dropped.x + side * (cardWidthOf(type) / 2 + WIRE_GAP), y: dropped.y }
      : view && rect
        ? view.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 240 + existing.length * 40, y: 240 + existing.length * 30 };
    const id = `${type}-${Date.now().toString(36)}`;
    const node: FlowNode = {
      id,
      type,
      position: placeNewNode(center, existing, type),
      selected: true,
      data: { params: params ?? inheritProvider(impl.definition.defaults as Record<string, unknown>, existing) },
    };
    setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), node]);
    const wire = placement.wire;
    if (!wire) return;
    const { origin, port } = wire;
    connect(
      origin.dir === "out"
        ? { source: origin.nodeId, sourceHandle: origin.handleId, target: id, targetHandle: port.name }
        : { source: id, sourceHandle: port.name, target: origin.nodeId, targetHandle: origin.handleId },
      [...existing, node],
    );
  };
  const addNode = (type: string) => insertNode(type, {});

  const onSpotPick = (item: CatalogItem) => {
    const s = spot;
    setSpot(null);
    if (!s) return;
    const template = item.template;
    if (template) {
      void wf.switchTo(() => api.createFromTemplate(template));
      return;
    }
    if (!item.nodeType) return;
    const port = s.filter && s.origin ? portFor(item, s.filter) : undefined;
    insertNode(item.nodeType, { at: s.at, wire: s.origin && port ? { origin: s.origin, port } : undefined }, item.asset ? { ...item.asset.params } : undefined);
  };

  // Khung nhóm chỉ để vẽ: dựng lại từ nodes + nhóm + kích thước đo được, không nằm trong state canvas và không được lưu (fromFlow
  // bỏ qua). Dây từ ngoài vào nhiều thẻ trong nhóm vẽ gộp thành một dây tới mép khung; dây gốc vẫn nằm nguyên trong `edges`.
  // Chọn khung không mở khung bên phải (khung phải chỉ cho đúng một node).
  const [selectedFrames, setSelectedFrames] = useState<ReadonlySet<string>>(new Set());
  // Mã nhóm lặp giữa các workflow (g1...): sang workflow khác thì bỏ chọn khung.
  useEffect(() => {
    setSelectedFrames((prev) => (prev.size > 0 ? new Set() : prev));
  }, [workflowId]);
  const bundles = useMemo(() => bundleEdges(edges, groupList), [edges, groupList]);
  const shownFrames = useRef<FlowNode[]>([]);
  const frames = useMemo(() => {
    const next = reuseFrames(
      shownFrames.current,
      groupFrames(nodes, groupList, measuredFrom(nodes), { secondsOf: (id) => videoSecondsOf(nodeStates[id]?.output), selected: selectedFrames, edges: bundles.visible }),
    );
    shownFrames.current = next;
    return next;
  }, [nodes, groupList, nodeStates, selectedFrames, bundles]);
  const displayNodes = useMemo(() => (frames.length > 0 ? [...frames, ...nodes] : nodes), [frames, nodes]);

  // Thay đổi canvas báo lên từ xyflow: thay đổi của khung (không có trong state) đổi thành dời cả nhóm / chọn khung; thẻ thành
  // viên của nhóm đang được kéo cùng khung thì bỏ thay đổi riêng của thẻ để không dời hai lần; xoá node thì rút khỏi nhóm tay.
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const frameIds = new Set(shownFrames.current.map((f) => f.id));
      const groupOfFrame = new Map(shownFrames.current.map((f) => [f.id, f.data.frame?.groupId ?? ""]));
      const rest: NodeChange<FlowNode>[] = [];
      const moves = new Map<string, { x: number; y: number }>();
      const picks: { id: string; selected: boolean }[] = [];
      for (const c of changes) {
        if (!("id" in c) || !frameIds.has(c.id)) {
          rest.push(c);
        } else if (c.type === "position" && c.position) {
          moves.set(groupOfFrame.get(c.id)!, c.position);
        } else if (c.type === "select") {
          picks.push({ id: c.id, selected: c.selected });
        }
      }
      const carried = new Set(groups.current.filter((g) => moves.has(g.id)).flatMap((g) => g.nodeIds));
      wf.onNodesChange(rest.filter((c) => !(c.type === "position" && carried.has(c.id))));
      if (moves.size > 0) setNodes((ns) => moveFramesTo(ns, groups.current, moves));
      if (picks.length > 0) {
        setSelectedFrames((prev) => {
          const next = new Set(prev);
          for (const p of picks) {
            if (p.selected) next.add(p.id);
            else next.delete(p.id);
          }
          return next;
        });
      }
      const removed = new Set(rest.flatMap((c) => (c.type === "remove" ? [c.id] : [])));
      if (removed.size > 0) {
        setGroups(pruneManualGroups(groups.current, removed));
        // Cả dây gốc đang bị gộp (không vẽ nên xyflow không biết) phải đi theo node bị xoá.
        setEdges((es) => pruneEdgesFor(es, removed));
      }
    },
    [wf.onNodesChange, setNodes, setEdges, setGroups, groups],
  );

  // Đúng một node đang chọn thì khung bên phải hiện nó; chọn nhiều node hoặc không chọn thì khung đóng.
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0]! : null;
  const inspectorSources = selectedNode ? sourcesOf(selectedNode.id, nodes, edges) : EMPTY_SOURCES;

  // Escape: đang gõ trong ô nhập thì chỉ thoát ô đó; không thì bỏ chọn node và khung (khung bên phải đóng).
  // Ctrl+G: gom các node đang chọn (từ 2 node trở lên) thành nhóm tay; đang gõ trong ô nhập thì để yên.
  // / hoặc Space: mở ô tìm node (Space không giành phím của nút đang được chọn; chặn luôn việc Space cuộn trang).
  // Ô tìm node đang mở thì nó tự lo phím của mình; đang gõ trong ô nhập (kể cả khung bên phải) thì / và Space là chữ.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (spotOpen.current) return;
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && el.matches("input, textarea, select, [contenteditable]:not([contenteditable=false])");
      if ((e.key === "/" || e.key === " ") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (typing || (e.key === " " && el instanceof HTMLElement && el.matches("button, a, summary, [role=button]"))) return;
        e.preventDefault();
        if (!e.repeat) openSpotlight();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "g") {
        if (typing) return;
        e.preventDefault();
        const ids = latest.current.nodes.filter((n) => n.selected && !isFrame(n)).map((n) => n.id);
        if (ids.length >= 2) setGroups(addManualGroup(groups.current, ids));
        return;
      }
      if (e.key !== "Escape") return;
      if (typing) {
        el.blur();
        return;
      }
      setSelectedFrames((prev) => (prev.size > 0 ? new Set() : prev));
      setNodes((ns) => (ns.some((n) => n.selected) ? ns.map((n) => (n.selected ? { ...n, selected: false } : n)) : ns));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setNodes, setGroups, groups, latest, openSpotlight]);

  const runId = run.run?.id ?? "";
  const runStatus = run.run?.status ?? "";
  const busy = run.active || run.starting || run.syncing;
  const editorApi: EditorApi = useMemo(
    () => ({
      setParams: (nodeId, patch) =>
        setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, ...patch } } } : n))),
      replaceParams: (nodeId, params) => setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, params: { ...params } } } : n))),
      stateOf: (nodeId) => nodeStates[nodeId],
      refreshKey: `${workflowId ?? ""}:${runId}:${runStatus}`,
      busy,
      expandScenes: (writerId) => void expandScenes(writerId),
      titleOf: (nodeId, baseLabel, params) => labelOf({ id: nodeId, params }, baseLabel, { groups: groups.current }),
    }),
    [nodeStates, setNodes, workflowId, runId, runStatus, busy, expandScenes, groups],
  );

  return (
    <EditorContext.Provider value={editorApi}>
      <div className="editor">
        <TopBar wf={wf} run={run} onAddNode={addNode} />
        <Banners wf={wf} run={run} />
        <div className="editor-body">
          <Rail onAdd={() => openSpotlight()} />
          <div className="canvas" ref={canvasRef}>
            <ReactFlow
              nodes={displayNodes}
              edges={bundles.visible}
              nodeTypes={nodeTypes}
              onInit={(inst) => {
                flow.current = inst;
              }}
              onNodesChange={onNodesChange}
              onEdgesChange={wf.onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              panActivationKeyCode={null}
              isValidConnection={isValidConnection}
              fitView
              fitViewOptions={{ padding: 0.3, minZoom: COMPACT_ZOOM }}
              minZoom={0.1}
              colorMode="dark"
            >
              <Background gap={24} />
              <Controls />
            </ReactFlow>
          </div>
          <aside className="right-panel">
            <Inspector node={selectedNode} sources={inspectorSources} />
            <QueuePanel />
          </aside>
        </div>
        {spot ? <Spotlight at={spot.at} filter={spot.filter} onPick={onSpotPick} onClose={() => setSpot(null)} /> : null}
      </div>
    </EditorContext.Provider>
  );
}
