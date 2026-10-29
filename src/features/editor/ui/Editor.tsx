import { addEdge, Background, Controls, ReactFlow, type Connection, type Edge, type IsValidConnection, type OnConnectEnd, type ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { webNodes } from "../../../nodes/registry.web";
import { labelOf } from "../../../shared/node-label";
import { Banners } from "./Banners";
import { connectionProblem, droppedConnectionProblem, edgeKindClass, replaceTargetEdges, targetAcceptsMany } from "./graph-convert";
import { GraphNode, type FlowNode } from "./GraphNode";
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

const nodeTypes = Object.fromEntries(Object.keys(webNodes).map((t) => [t, GraphNode]));

export function Editor() {
  const wf = useWorkflow();
  const run = useRun(wf);
  const { workflowId, nodes, edges, setNodes, setEdges, setProblem, latest, groups } = wf;
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

  // Đúng một node đang chọn thì khung bên phải hiện nó; chọn nhiều node hoặc không chọn thì khung đóng.
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0]! : null;
  const inspectorSources = selectedNode ? sourcesOf(selectedNode.id, nodes, edges) : EMPTY_SOURCES;

  // Escape: đang gõ trong ô nhập thì chỉ thoát ô đó; không thì bỏ chọn node (khung bên phải đóng).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches("input, textarea, select")) {
        el.blur();
        return;
      }
      setNodes((ns) => (ns.some((n) => n.selected) ? ns.map((n) => (n.selected ? { ...n, selected: false } : n)) : ns));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setNodes]);

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
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onInit={(inst) => {
                flow.current = inst;
              }}
              onNodesChange={wf.onNodesChange}
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
