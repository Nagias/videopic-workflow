import { addEdge, Background, Controls, ReactFlow, type Connection, type Edge, type IsValidConnection, type NodeChange, type OnConnectEnd, type ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { webNodes } from "../../../nodes/registry.web";
import { labelOf } from "../../../shared/node-label";
import { Banners } from "./Banners";
import { connectionProblem, droppedConnectionProblem, edgeKindClass, replaceTargetEdges, targetAcceptsMany } from "./graph-convert";
import { videoSecondsOf } from "./card-media";
import { GraphNode, type FlowNode } from "./GraphNode";
import { GroupFrame } from "./GroupFrame";
import { addManualGroup, bundleEdges, GROUP_FRAME_TYPE, groupFrames, isFrame, measuredFrom, moveFrameTo, pruneManualGroups, reuseFrames } from "./groups";
import { COMPACT_ZOOM } from "./NodeCard";
import { Inspector, sourcesOf, type InspectorSources } from "./Inspector";
import { inheritProvider, placeNewNode } from "./new-node";
import { EditorContext, type EditorApi } from "./node-kit";
import { QueuePanel } from "./QueuePanel";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";
import { useRun } from "./use-run";
import { useWorkflow } from "./use-workflow";

const EMPTY_SOURCES: InspectorSources = { nodes: [], edges: [] };

const nodeTypes = { ...Object.fromEntries(Object.keys(webNodes).map((t) => [t, GraphNode])), [GROUP_FRAME_TYPE]: GroupFrame };

export function Editor() {
  const wf = useWorkflow();
  const run = useRun(wf);
  const { workflowId, nodes, edges, setNodes, setEdges, setProblem, latest, groups, groupList, setGroups } = wf;
  const { nodeStates, expandScenes } = run;
  const flow = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const isValidConnection: IsValidConnection<Edge> = useCallback((conn) => connectionProblem(conn, latest.current.nodes) === null, [latest]);

  const onConnect = useCallback(
    (conn: Connection) => {
      const why = connectionProblem(conn, latest.current.nodes);
      if (why) {
        setProblem(why);
        return;
      }
      setProblem(null);
      const edge: Edge = {
        ...conn,
        id: `e-${conn.source}-${conn.sourceHandle}-${conn.target}-${conn.targetHandle}`,
        className: edgeKindClass(conn, latest.current.nodes),
      };
      // Cổng thường chỉ nhận một dây (nối mới thay dây cũ); cổng multiple nhận thêm dây.
      const many = targetAcceptsMany(conn, latest.current.nodes);
      setEdges((eds) => addEdge(edge, replaceTargetEdges(eds, conn, many)));
    },
    [setEdges, setProblem, latest],
  );

  // Thả dây lên cổng không hợp: React Flow im lặng bỏ qua, ở đây nói rõ vì sao.
  const onConnectEnd: OnConnectEnd = useCallback(
    (_event, state) => {
      if (state.isValid !== false || !state.fromHandle || !state.toHandle) return;
      setProblem(droppedConnectionProblem(state.fromHandle, state.toHandle, latest.current.nodes));
    },
    [setProblem, latest],
  );

  const addNode = (type: string) => {
    const impl = webNodes[type];
    if (!impl) return;
    const existing = latest.current.nodes;
    const rect = canvasRef.current?.getBoundingClientRect();
    const center =
      flow.current && rect
        ? flow.current.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 240 + existing.length * 40, y: 240 + existing.length * 30 };
    const id = `${type}-${Date.now().toString(36)}`;
    const params = inheritProvider(impl.definition.defaults as Record<string, unknown>, existing);
    setNodes((ns) => [
      ...ns.map((n) => (n.selected ? { ...n, selected: false } : n)),
      { id, type, position: placeNewNode(center, ns, type), selected: true, data: { params } },
    ]);
  };

  // Khung nhóm chỉ để vẽ: dựng lại từ nodes + nhóm + kích thước đo được, không nằm trong state canvas và không được lưu (fromFlow
  // bỏ qua). Dây từ ngoài vào nhiều thẻ trong nhóm vẽ gộp thành một dây tới mép khung; dây gốc vẫn nằm nguyên trong `edges`.
  // Chọn khung không mở khung bên phải (khung phải chỉ cho đúng một node).
  const [selectedFrames, setSelectedFrames] = useState<ReadonlySet<string>>(new Set());
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
      if (moves.size > 0) setNodes((ns) => [...moves].reduce((acc, [groupId, to]) => moveFrameTo(acc, groups.current, groupId, to), ns));
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
      if (removed.size > 0) setGroups(pruneManualGroups(groups.current, removed));
    },
    [wf.onNodesChange, setNodes, setGroups, groups],
  );

  // Đúng một node đang chọn thì khung bên phải hiện nó; chọn nhiều node hoặc không chọn thì khung đóng.
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0]! : null;
  const inspectorSources = selectedNode ? sourcesOf(selectedNode.id, nodes, edges) : EMPTY_SOURCES;

  // Escape: đang gõ trong ô nhập thì chỉ thoát ô đó; không thì bỏ chọn node và khung (khung bên phải đóng).
  // Ctrl+G: gom các node đang chọn (từ 2 node trở lên) thành nhóm tay; đang gõ trong ô nhập thì để yên.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && el.matches("input, textarea, select");
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
  }, [setNodes, setGroups, groups, latest]);

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
          <Rail />
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
      </div>
    </EditorContext.Provider>
  );
}
