import { addEdge, Background, Controls, MiniMap, Panel, ReactFlow, type Connection, type Edge, type IsValidConnection, type NodeChange, type OnConnectEnd, type ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api } from "../../../app/api-client";
import { webNodes } from "../../../nodes/registry.web";
import type { EstimateResponse, RunScope } from "../../../shared/api";
import type { PortDef } from "../../../shared/ports";
import { labelOf } from "../../../shared/node-label";
import { Banners } from "./Banners";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { needsConfirm } from "./estimate-view";
import { connectionProblem, droppedConnectionProblem, edgeKindClass, fromFlow, replaceTargetEdges, targetAcceptsMany } from "./graph-convert";
import { videoSecondsOf } from "./card-media";
import { portFor, type CatalogItem, type PortFilter } from "./catalog";
import { GraphNode, type FlowNode } from "./GraphNode";
import { GroupFrame } from "./GroupFrame";
import { addManualGroup, bundleEdges, GROUP_FRAME_TYPE, groupFrames, isFrame, measuredFrom, moveFramesTo, pruneEdgesFor, pruneManualGroups, reuseFrames } from "./groups";
import { COMPACT_ZOOM } from "./NodeCard";
import { Inspector, sourcesOf, type InspectorSources } from "./Inspector";
import { cardWidthOf, inheritProvider, placeNewNode } from "./new-node";
import { EditorContext, type EditorApi } from "./node-kit";
import { duplicateNode, freshNodeId, nextTake, paramsHaveTake, restoreTake, takeBefore } from "./node-ops";
import { QueuePanel } from "./QueuePanel";
import { Rail } from "./Rail";
import { RunConfirm } from "./RunConfirm";
import { actionFor } from "./shortcuts";
import { ShortcutSheet } from "./ShortcutSheet";
import { Spotlight, type ScreenPoint } from "./Spotlight";
import { TopBar } from "./TopBar";
import { useEstimate } from "./use-estimate";
import { useRun } from "./use-run";
import { errText, useWorkflow } from "./use-workflow";

const EMPTY_SOURCES: InspectorSources = { nodes: [], edges: [] };

// Dây kéo từ cổng ra chỗ trống: thẻ mới nằm cách chỗ thả ngần này (đơn vị canvas) để thấy được đoạn dây.
const WIRE_GAP = 12;

// Khung nhìn "vừa màn hình": dùng chung cho lúc mở workflow, phím F và lệnh trong menu chuột phải.
const FIT_OPTIONS = { padding: 0.3, minZoom: COMPACT_ZOOM };

// Menu chuột phải: trên nền canvas (pane), trên một node (nodeId), hoặc trên khung chọn nhiều node (không có nodeId).
type MenuState = { x: number; y: number; kind: "pane" } | { x: number; y: number; kind: "node"; nodeId?: string };

type WireOrigin = { nodeId: string; handleId: string; dir: PortFilter["dir"] };
type SpotState = { at?: ScreenPoint; filter?: PortFilter; origin?: WireOrigin };
type Placement = { at?: ScreenPoint; wire?: { origin: WireOrigin; port: PortDef } };

// Xin chạy phải qua hộp xác nhận (khi cần): ước tính đã có, đang chờ người dùng bấm. `edit` là sửa đồ thị đã làm ngay trước đó
// (Chạy lại tăng take) kèm cách hoàn lại nếu không chạy nữa.
type RunEdit = { apply: () => void; undo: () => void };
// `graphKey`: dạng chữ của đồ thị lúc ước tính; đồ thị đổi từ đó (không nên xảy ra: giao diện bị khoá) thì không chạy theo con số cũ.
type PendingRun = { scope: RunScope; estimate: EstimateResponse; edit?: RunEdit; graphKey: string };

// MiniMap nhỏ gọn hơn mặc định (200x150) để che ít thẻ ở góc dưới phải canvas. Chỉ để nhìn (không kéo/thu phóng trong đó, và
// không bắt chuột: .minimap-slot trong styles.css): thẻ nằm dưới nó vẫn bấm được, bản đồ không bao giờ chặn việc đang làm.
const MINIMAP_SIZE = { width: 150, height: 100 };

// MiniMap: thẻ là ô đặc, khung nhóm chỉ là viền (ô đặc sẽ che hết thẻ bên trong).
const isFrameType = (n: { type?: string }) => n.type === GROUP_FRAME_TYPE;
const miniNodeColor = (n: { type?: string; selected?: boolean }) => (isFrameType(n) ? "transparent" : n.selected ? "#6c8cff" : "rgb(120 130 155 / 0.55)");
const miniNodeStroke = (n: { type?: string }) => (isFrameType(n) ? "#3a4150" : "transparent");

const nodeTypes = { ...Object.fromEntries(Object.keys(webNodes).map((t) => [t, GraphNode])), [GROUP_FRAME_TYPE]: GroupFrame };

export function Editor() {
  const wf = useWorkflow();
  const run = useRun(wf);
  const { workflowId, nodes, edges, setNodes, setEdges, setProblem, latest, groups, groupList, setGroups } = wf;
  const { nodeStates, outdated, expandScenes } = run;
  // Đang kiểm ước tính / hộp xác nhận đang mở: cũng tính là bận, để mọi đường chạy (nút, phím, menu) đứng yên.
  const [checking, setChecking] = useState(false);
  const busy = run.active || run.starting || run.syncing || checking;
  const estimateView = useEstimate(workflowId, wf.saveState, !busy);
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
      openSpotlight({ x: pointer.clientX, y: pointer.clientY }, { kind: port.kind, dir, handle: port.name }, { nodeId: from.nodeId, handleId: port.name, dir });
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
    const id = freshNodeId(type, existing);
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
      groupFrames(nodes, groupList, measuredFrom(nodes), {
        secondsOf: (id) => videoSecondsOf(nodeStates[id]?.output),
        selected: selectedFrames,
        edges: bundles.visible,
        // Chưa có ước tính (đang tính, lỗi) thì khung không ghi dòng luật nào, chứ không ghi "✓" giả.
        warnings: estimateView.estimate?.warnings,
      }),
    );
    shownFrames.current = next;
    return next;
  }, [nodes, groupList, nodeStates, selectedFrames, bundles, estimateView.estimate]);
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

  const runId = run.run?.id ?? "";
  const runStatus = run.run?.status ?? "";
  const { startRun } = run;
  const { save } = wf;

  // Mọi đường bấm chạy (nút Chạy, menu chuột phải, Ctrl+Enter, Shift+Enter, nút ▶ trên thẻ) đi qua MỘT hàm này, và qua đây là qua
  // hộp xác nhận: lưu đồ thị → hỏi API ước tính (chỉ đọc bản đã lưu) → nếu cần thì hiện hộp, người dùng bấm "▶ Chạy" mới xin chạy.
  // Ước tính lỗi thì báo lỗi và KHÔNG chạy. `edit` (Chạy lại tăng take) áp trước khi lưu để ước tính tính trên bản đã tăng; không
  // chạy nữa (Huỷ, lỗi) thì hoàn lại và lưu lại. `gate` chặn bấm lần hai trong lúc state chưa kịp cập nhật: chỉ một hộp, một lần chạy.
  const gate = useRef(false);
  const [pending, setPending] = useState<PendingRun | null>(null);

  const release = useCallback(() => {
    gate.current = false;
    setChecking(false);
  }, []);

  // Đồ thị trên canvas ở dạng chữ (đúng phần được lưu): so sánh "đã đổi chưa" giữa lúc ước tính và lúc bấm "▶ Chạy".
  const graphKey = useCallback(() => JSON.stringify(fromFlow(latest.current.nodes, latest.current.edges, groups.current)), [latest, groups]);

  // Hoàn lại sửa đổi của lần xin chạy không đi tiếp (Huỷ, lỗi). `prior`: lời báo lỗi đã có (ước tính hỏng...); lưu lại cũng hỏng thì
  // báo cả hai, không để lỗi sau nuốt lỗi trước.
  const revert = useCallback(
    async (edit: RunEdit | undefined, prior?: string) => {
      if (!edit) return;
      flushSync(() => edit.undo());
      try {
        await save();
      } catch (e) {
        const second = `Không lưu lại được bản cũ sau khi bỏ chạy: ${errText(e)}`;
        setProblem(prior ? `${prior} — ${second}` : second);
      }
    },
    [save, setProblem],
  );

  const confirmAndRun = useCallback(
    async (scope: RunScope, edit?: RunEdit) => {
      if (!workflowId || busy || gate.current) return;
      gate.current = true;
      setChecking(true);
      setProblem(null);
      let waiting = false;
      try {
        edit?.apply();
        // Đồ thị lấy chữ ngay trước khi lưu: đúng bản được ước tính (lưu và ước tính là chuyện sau).
        const key = graphKey();
        await save();
        const estimate = await api.estimate(workflowId, scope);
        if (needsConfirm(scope, estimate)) {
          setPending({ scope, estimate, edit, graphKey: key });
          waiting = true;
          return;
        }
        await startRun(scope);
      } catch (e) {
        setProblem(errText(e));
        await revert(edit, errText(e));
      } finally {
        if (!waiting) release();
      }
    },
    [workflowId, busy, save, startRun, setProblem, revert, release, graphKey],
  );

  const runScope = useCallback((scope: RunScope, edit?: RunEdit) => void confirmAndRun(scope, edit), [confirmAndRun]);

  const answerPending = async (ok: boolean) => {
    const p = pending;
    if (!p) return;
    setPending(null);
    let waiting = false;
    try {
      if (!ok) {
        await revert(p.edit);
      } else if (workflowId && graphKey() !== p.graphKey) {
        // Đồ thị đã khác bản đã ước tính: không chạy theo con số cũ, ước tính lại rồi hỏi lại.
        try {
          const key = graphKey();
          await save();
          const estimate = await api.estimate(workflowId, p.scope);
          setPending({ ...p, estimate, graphKey: key });
          waiting = true;
        } catch (e) {
          setProblem(errText(e));
          await revert(p.edit, errText(e));
        }
      } else {
        await startRun(p.scope);
      }
    } finally {
      if (!waiting) release();
    }
  };

  // Node `nodeId` sẽ chạy một "bản mới": tăng take (flushSync để canvas, nơi save() lấy đồ thị, thấy số mới). Huỷ ở hộp xác nhận
  // thì trả take về đúng giá trị cũ (hoặc bỏ khoá nếu trước đó chưa có).
  const rerunNode = (nodeId: string) => {
    const before = takeBefore(latest.current.nodes.find((n) => n.id === nodeId)?.data.params ?? {});
    const withParams = (change: (params: Record<string, unknown>) => Record<string, unknown>) =>
      setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, params: change(n.data.params) } } : n)));
    runScope(
      { mode: "node", nodeId },
      {
        apply: () => flushSync(() => withParams((params) => ({ ...params, take: nextTake(params) }))),
        undo: () => withParams((params) => restoreTake(params, before)),
      },
    );
  };

  // Tên hiện trên thẻ của một node (cho hàng chờ).
  const nodeTitle = (id: string) => {
    const n = latest.current.nodes.find((x) => x.id === id);
    return n ? labelOf({ id, params: n.data.params }, webNodes[n.type ?? ""]?.definition.label ?? id, { groups: groups.current }) : id;
  };

  const fitAll = () => void flow.current?.fitView(FIT_OPTIONS);

  const duplicate = (nodeId: string) => {
    const nodesNow = latest.current.nodes;
    const source = nodesNow.find((n) => n.id === nodeId);
    const next = source ? duplicateNode(nodesNow, nodeId, freshNodeId(source.type ?? "node", nodesNow)) : null;
    if (next) setNodes(next);
  };

  // Ctrl+G và "▢ Nhóm" trong menu: cùng hàm này.
  const groupSelected = () => {
    const ids = latest.current.nodes.filter((n) => n.selected && !isFrame(n)).map((n) => n.id);
    if (ids.length >= 2) setGroups(addManualGroup(groups.current, ids));
  };

  // Phím Delete/Backspace và "🗑 Xoá" trong menu: cùng hàm này. deleteElements báo qua onNodesChange ở trên (rút nhóm tay, xoá cả
  // dây gốc đang bị gộp); khung nhóm không bao giờ vào danh sách xoá.
  const deleteSelection = () => {
    const nodeIds = latest.current.nodes.filter((n) => n.selected && !isFrame(n)).map((n) => ({ id: n.id }));
    const edgeIds = latest.current.edges.filter((e) => e.selected).map((e) => ({ id: e.id }));
    if (nodeIds.length > 0 || edgeIds.length > 0) void flow.current?.deleteElements({ nodes: nodeIds, edges: edgeIds });
  };

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeMenu = useCallback(() => setMenu(null), []);
  // Workflow khác: menu và bảng đang mở không còn đúng.
  useEffect(() => {
    setMenu(null);
    setSheetOpen(false);
  }, [workflowId]);

  // Mọi phím tắt qua actionFor (shortcuts.ts, hàm thuần): ở đây chỉ làm việc. preventDefault chỉ khi phím có việc để làm. Ô tìm node
  // đang mở thì nó tự lo phím của mình; đang gõ trong ô nhập (kể cả khung bên phải) thì chỉ Esc còn tác dụng (thoát ô);
  // bảng phím tắt đang mở thì chỉ ? và Esc (đóng bảng). Giữ phím (e.repeat) chỉ chặn mặc định, không làm lại việc.
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  onKeyRef.current = (e) => {
    if (spotOpen.current || gate.current) return;
    const el = document.activeElement;
    const typing = el instanceof HTMLElement && el.matches("input, textarea, select, [contenteditable]:not([contenteditable=false])");
    const onControl = el instanceof HTMLElement && el.matches("button, a, summary, [role=button]");
    const action = actionFor(e, typing, onControl);
    if (!action) return;
    if (sheetOpen && action !== "escape" && action !== "help") return;
    e.preventDefault();
    if (e.repeat) return;
    if (action !== "escape") setMenu(null);
    switch (action) {
      case "spotlight":
        openSpotlight();
        return;
      case "run-all":
        runScope({ mode: "all" });
        return;
      case "run-selected":
        if (selectedNode) runScope({ mode: "node", nodeId: selectedNode.id });
        return;
      case "duplicate":
        if (selectedNode) duplicate(selectedNode.id);
        return;
      case "group":
        groupSelected();
        return;
      case "delete":
        deleteSelection();
        return;
      case "fit":
        fitAll();
        return;
      case "help":
        setSheetOpen((open) => !open);
        return;
      case "escape":
        if (menu) setMenu(null);
        else if (sheetOpen) setSheetOpen(false);
        else if (typing && el instanceof HTMLElement) el.blur();
        else {
          setSelectedFrames((prev) => (prev.size > 0 ? new Set() : prev));
          setNodes((ns) => (ns.some((n) => n.selected) ? ns.map((n) => (n.selected ? { ...n, selected: false } : n)) : ns));
        }
        return;
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Chuột phải node: chưa được chọn thì chọn riêng nó (đang nằm trong nhóm node chọn thì giữ nguyên nhóm chọn). Khung nhóm không
  // có lệnh riêng: chuột phải tiêu đề khung ra menu chỗ trống.
  const onNodeContextMenu = (event: { preventDefault(): void; clientX: number; clientY: number }, node: FlowNode) => {
    event.preventDefault();
    const at = { x: event.clientX, y: event.clientY };
    if (isFrame(node)) {
      setMenu({ ...at, kind: "pane" });
      return;
    }
    if (!latest.current.nodes.some((n) => n.id === node.id && n.selected)) {
      setSelectedFrames((prev) => (prev.size > 0 ? new Set() : prev));
      setNodes((ns) => ns.map((n) => (n.selected !== (n.id === node.id) ? { ...n, selected: n.id === node.id } : n)));
    }
    setMenu({ ...at, kind: "node", nodeId: node.id });
  };
  const onSelectionContextMenu = (event: { preventDefault(): void; clientX: number; clientY: number }) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, kind: "node" });
  };
  const onPaneContextMenu = (event: { preventDefault(): void; clientX: number; clientY: number }) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, kind: "pane" });
  };

  // Lệnh của menu đang mở. Lệnh chưa làm trong đợt này thì không có mặt (không để lệnh chết).
  const menuItems = (): MenuItem[] => {
    if (!menu) return [];
    if (menu.kind === "pane") {
      const here = { x: menu.x, y: menu.y };
      return [
        { testid: "ctx-add-here", icon: "＋", label: "Thêm node ở đây", run: () => openSpotlight(here) },
        { testid: "ctx-fit", icon: "⤢", label: "Vừa màn hình", hint: "F", run: fitAll },
      ];
    }
    const target = menu.nodeId ? latest.current.nodes.find((n) => n.id === menu.nodeId) : undefined;
    const impl = target ? webNodes[target.type ?? ""] : undefined;
    const items: MenuItem[] = [];
    if (target && impl) {
      items.push(
        { testid: "ctx-run-node", icon: "▶", label: "Chạy node này", hint: "Shift+Enter", disabled: busy, run: () => runScope({ mode: "node", nodeId: target.id }) },
        { testid: "ctx-run-downstream", icon: "▶▶", label: "Chạy từ đây trở đi", disabled: busy, run: () => runScope({ mode: "downstream", nodeId: target.id }) },
      );
      if (paramsHaveTake(impl.definition.params)) {
        items.push({ testid: "ctx-rerun", icon: "↻", label: "Chạy lại (bản mới)", disabled: busy, run: () => rerunNode(target.id) });
      }
    }
    if (target) items.push({ testid: "ctx-duplicate", icon: "⧉", label: "Nhân bản", hint: "Ctrl+D", run: () => duplicate(target.id) });
    if (selectedNodes.length >= 2) items.push({ testid: "ctx-group", icon: "▢", label: "Nhóm", hint: "Ctrl+G", run: groupSelected });
    items.push({ testid: "ctx-delete", icon: "🗑", label: "Xoá", hint: "Delete", run: deleteSelection });
    return items;
  };

  const editorApi: EditorApi = useMemo(
    () => ({
      setParams: (nodeId, patch) =>
        setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, ...patch } } } : n))),
      replaceParams: (nodeId, params) => setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, params: { ...params } } } : n))),
      stateOf: (nodeId) => nodeStates[nodeId],
      isOutdated: (nodeId) => outdated.has(nodeId),
      refreshKey: `${workflowId ?? ""}:${runId}:${runStatus}`,
      busy,
      expandScenes: (writerId) => void expandScenes(writerId),
      titleOf: (nodeId, baseLabel, params) => labelOf({ id: nodeId, params }, baseLabel, { groups: groups.current }),
      runNode: (nodeId) => runScope({ mode: "node", nodeId }),
    }),
    [nodeStates, outdated, setNodes, workflowId, runId, runStatus, busy, expandScenes, groups, runScope],
  );

  return (
    <EditorContext.Provider value={editorApi}>
      {/* inert: đang kiểm ước tính hoặc hộp xác nhận đang mở thì cả thanh trên, canvas, khung phải không nhận chuột, phím, tiêu điểm:
          đồ thị không đổi được giữa lúc ước tính và lúc bấm "▶ Chạy". Hộp xác nhận nằm NGOÀI vùng này. */}
      <div className="editor" inert={checking}>
        <TopBar wf={wf} run={run} onAddNode={addNode} onRun={() => runScope({ mode: "all" })} checking={checking} estimate={estimateView} />
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
              onNodeContextMenu={onNodeContextMenu}
              onSelectionContextMenu={onSelectionContextMenu}
              onPaneContextMenu={onPaneContextMenu}
              onMoveStart={closeMenu}
              panActivationKeyCode={null}
              deleteKeyCode={null}
              isValidConnection={isValidConnection}
              fitView
              fitViewOptions={FIT_OPTIONS}
              minZoom={0.1}
              colorMode="dark"
            >
              <Background gap={24} />
              {/* Góc dưới phải (spec 8.1): nút phóng/thu/vừa màn hình nằm ngay trên minimap, không chồng nhau. */}
              <Controls position="bottom-right" orientation="horizontal" style={{ marginBottom: MINIMAP_SIZE.height + 22 }} />
              <Panel position="bottom-right" className="minimap-slot" data-testid="minimap">
                <MiniMap
                  style={MINIMAP_SIZE}
                  bgColor="rgb(23 26 33 / 0.55)"
                  nodeColor={miniNodeColor}
                  nodeStrokeColor={miniNodeStroke}
                  nodeStrokeWidth={3}
                  nodeBorderRadius={3}
                  maskColor="rgb(15 17 21 / 0.25)"
                />
              </Panel>
              {!run.active && run.run ? (
                <Panel position="bottom-left" className="queue-slot">
                  <QueuePanel variant="floating" run={run} titleOf={nodeTitle} />
                </Panel>
              ) : null}
            </ReactFlow>
          </div>
          <aside className="right-panel">
            <QueuePanel variant="panel" run={run} titleOf={nodeTitle} />
            <Inspector node={selectedNode} sources={inspectorSources} />
          </aside>
        </div>
        {spot ? <Spotlight at={spot.at} filter={spot.filter} onPick={onSpotPick} onClose={() => setSpot(null)} /> : null}
        {menu ? <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={closeMenu} /> : null}
        {sheetOpen ? <ShortcutSheet onClose={() => setSheetOpen(false)} /> : null}
      </div>
      {pending ? <RunConfirm scope={pending.scope} estimate={pending.estimate} onOk={() => void answerPending(true)} onCancel={() => void answerPending(false)} /> : null}
    </EditorContext.Provider>
  );
}
