import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type IsValidConnection,
  type OnConnectEnd,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../app/api-client";
import { webNodes } from "../../../nodes/registry.web";
import type { MuseAccountsResponse, RunResponse, WorkflowListResponse, WorkflowResponse } from "../../../shared/api";
import { WORKFLOW_TEMPLATES } from "../../../shared/templates";
import type { WorkflowGroup } from "../../../shared/workflow";
import { connectionProblem, droppedConnectionProblem, edgeKindClass, fromFlow, replaceTargetEdges, targetAcceptsMany, toFlow } from "./graph-convert";
import { GraphNode, type FlowNode } from "./GraphNode";
import { inheritProvider, placeNewNode } from "./new-node";
import { EditorContext, type EditorApi } from "./node-kit";

const nodeTypes = Object.fromEntries(Object.keys(webNodes).map((t) => [t, GraphNode]));
const SAVE_DELAY_MS = 600;
const POLL_MS = 1000;

type SaveState = "idle" | "saving" | "saved" | "error";

const RUN_LABEL: Record<RunResponse["status"], string> = {
  queued: "Đang xếp hàng…",
  running: "Đang chạy…",
  succeeded: "Chạy xong",
  failed: "Lỗi",
};

export function Editor() {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [run, setRun] = useState<RunResponse | null>(null);
  // true khi `run` là lần chạy cũ tải lại lúc mở workflow (chưa xem trực tiếp trong phiên này).
  const [runFromHistory, setRunFromHistory] = useState(false);
  const [starting, setStarting] = useState(false);
  const flow = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const shownWorkflow = useRef<string | null>(null);
  const currentRun = useRef<RunResponse | null>(null);
  currentRun.current = run;
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [muse, setMuse] = useState<MuseAccountsResponse | null>(null);
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ nodes, edges });
  latest.current = { nodes, edges };
  // Nhóm (Phân cảnh) của workflow đang mở: canvas chưa sửa nhóm, nhưng lưu phải giữ nguyên để Biên kịch còn tạo lại được.
  const groups = useRef<WorkflowGroup[]>([]);

  const [workflowList, setWorkflowList] = useState<WorkflowListResponse["workflows"]>([]);

  const showWorkflow = useCallback(
    (wf: WorkflowResponse) => {
      loaded.current = false;
      const flow = toFlow(wf.graph);
      groups.current = wf.graph.groups;
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setWorkflowId(wf.id);
      setRun(null);
      setRunFromHistory(false);
      shownWorkflow.current = wf.id;
      setSaveState("idle");
      const url = new URL(window.location.href);
      url.searchParams.set("wf", wf.id);
      window.history.replaceState(null, "", url);
      loaded.current = true;
      api.listWorkflows().then((l) => setWorkflowList(l.workflows), () => setWorkflowList([]));
      api.getLatestRun(wf.id).then(
        ({ run: last, nodes }) => {
          // Đã đổi sang workflow khác, hoặc đã bấm Chạy trong lúc chờ: bỏ kết quả cũ.
          if (shownWorkflow.current !== wf.id || !last || currentRun.current) return;
          // Mỗi node hiện kết quả mới nhất của nó qua mọi lần chạy (lần gần nhất có thể chỉ chạy một phần).
          setRun({ ...last, nodes });
          setRunFromHistory(true);
        },
        (e: unknown) => setProblem(`Không tải được kết quả lần chạy trước: ${e instanceof Error ? e.message : String(e)}`),
      );
    },
    [setNodes, setEdges],
  );

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("wf");
    (wanted ? api.getWorkflow(wanted).catch(() => api.getDefaultWorkflow()) : api.getDefaultWorkflow())
      .then(showWorkflow)
      .catch((e: unknown) => setProblem(`Không tải được workflow: ${e instanceof Error ? e.message : String(e)}`));
    api
      .getMuseAccounts()
      .then(setMuse)
      .catch(() => setMuse(null));
  }, [showWorkflow]);

  const save = useCallback(async () => {
    if (!workflowId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    setSaveState("saving");
    try {
      await api.saveWorkflow(workflowId, { graph: fromFlow(latest.current.nodes, latest.current.edges, groups.current) });
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      throw e;
    }
  }, [workflowId]);

  useEffect(() => {
    if (!loaded.current || !workflowId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save().catch((e: unknown) => setProblem(`Không lưu được: ${e instanceof Error ? e.message : String(e)}`));
    }, SAVE_DELAY_MS);
  }, [nodes, edges, workflowId, save]);

  const active = run !== null && (run.status === "queued" || run.status === "running");
  useEffect(() => {
    if (!active || !run) return;
    const t = setInterval(() => {
      api
        .getRun(run.id)
        .then((r) => {
          setRun(r);
          setRunFromHistory(false);
        })
        .catch((e: unknown) => setProblem(`Mất kết nối khi theo dõi lần chạy: ${e instanceof Error ? e.message : String(e)}`));
    }, POLL_MS);
    return () => clearInterval(t);
  }, [active, run]);

  const runNow = useCallback(async () => {
    if (!workflowId) return;
    setProblem(null);
    setStarting(true);
    try {
      await save();
      const { runId } = await api.startRun(workflowId);
      setRun({ id: runId, status: "queued", error: null, decision: null, nodes: {} });
      setRunFromHistory(false);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }, [workflowId, save]);

  const isValidConnection: IsValidConnection<Edge> = useCallback(
    (conn) => connectionProblem(conn, latest.current.nodes) === null,
    [],
  );

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
    [setEdges],
  );

  // Thả dây lên cổng không hợp: React Flow im lặng bỏ qua, ở đây nói rõ vì sao.
  const onConnectEnd: OnConnectEnd = useCallback((_event, state) => {
    if (state.isValid !== false || !state.fromHandle || !state.toHandle) return;
    setProblem(droppedConnectionProblem(state.fromHandle, state.toHandle, latest.current.nodes));
  }, []);

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
      { id, type, position: placeNewNode(center, ns), selected: true, data: { params } },
    ]);
  };

  const editorApi: EditorApi = useMemo(
    () => ({
      setParams: (nodeId, patch) =>
        setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, ...patch } } } : n))),
      replaceParams: (nodeId, params) => setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, params: { ...params } } } : n))),
      stateOf: (nodeId) => run?.nodes[nodeId],
      refreshKey: `${workflowId ?? ""}:${run?.id ?? ""}:${run?.status ?? ""}`,
    }),
    [run, setNodes, workflowId],
  );

  const runLabel = run ? (runFromHistory && !active ? `Lần trước: ${RUN_LABEL[run.status]}` : RUN_LABEL[run.status]) : "";
  const runError = run?.error ? (runFromHistory && !active ? `Lần chạy trước lỗi: ${run.error}` : run.error) : null;

  const readyMuse = muse?.accounts.filter((a) => a.loggedIn).length ?? 0;

  const switchTo = async (load: () => Promise<WorkflowResponse>) => {
    setProblem(null);
    try {
      if (workflowId) await save();
      showWorkflow(await load());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <EditorContext.Provider value={editorApi}>
      <div className="editor">
        <div className="toolbar">
          <h1>VideoPic Workflow</h1>
          <select
            data-testid="workflow-select"
            value={workflowId ?? ""}
            onChange={(e) => void switchTo(() => api.getWorkflow(e.target.value))}
          >
            {workflowList.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {WORKFLOW_TEMPLATES.map((t) => (
            <button key={t.id} type="button" data-testid={`template-${t.id}`} onClick={() => void switchTo(() => api.createFromTemplate(t.id))}>
              + Mẫu {t.name}
            </button>
          ))}
          <select
            data-testid="add-node"
            value=""
            onChange={(e) => {
              if (e.target.value) addNode(e.target.value);
            }}
          >
            <option value="">+ Thêm node…</option>
            {Object.entries(webNodes).map(([type, impl]) => (
              <option key={type} value={type}>
                {impl.definition.label}
              </option>
            ))}
          </select>
          <span className="muse-accounts" data-testid="muse-accounts" title={muse?.accounts.map((a) => `${a.id}: ${a.state}`).join("\n")}>
            Muse: {readyMuse}/{muse?.accounts.length ?? 0} tài khoản
          </span>
          <span className={`save-state ${saveState}`} data-testid="save-status">
            {saveState === "saving" ? "Đang lưu…" : saveState === "saved" ? "Đã lưu" : saveState === "error" ? "Lưu lỗi" : ""}
          </span>
          <span className={`run-state ${starting ? "queued" : (run?.status ?? "")}`} data-testid="run-status">
            {starting ? RUN_LABEL.queued : runLabel}
          </span>
          <button type="button" className="primary" data-testid="run-button" disabled={!workflowId || active || starting} onClick={() => void runNow()}>
            {active || starting ? "Đang chạy…" : "▶ Chạy"}
          </button>
        </div>
        {problem || runError ? (
          <div className="banner" data-testid="problem-banner">
            {problem ?? runError}
            <button type="button" onClick={() => setProblem(null)}>
              Đóng
            </button>
          </div>
        ) : null}
        <div className="canvas" ref={canvasRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(inst) => {
              flow.current = inst;
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnection}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            colorMode="dark"
          >
            <Background gap={24} />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    </EditorContext.Provider>
  );
}
