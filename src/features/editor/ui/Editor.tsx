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
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../app/api-client";
import { webNodes } from "../../../nodes/registry.web";
import type { MuseAccountsResponse, RunResponse, WorkflowListResponse, WorkflowResponse } from "../../../shared/api";
import { WORKFLOW_TEMPLATES } from "../../../shared/templates";
import { connectionProblem, fromFlow, toFlow } from "./graph-convert";
import { GraphNode, type FlowNode } from "./GraphNode";
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
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [muse, setMuse] = useState<MuseAccountsResponse | null>(null);
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ nodes, edges });
  latest.current = { nodes, edges };

  const [workflowList, setWorkflowList] = useState<WorkflowListResponse["workflows"]>([]);

  const showWorkflow = useCallback(
    (wf: WorkflowResponse) => {
      loaded.current = false;
      const flow = toFlow(wf.graph);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setWorkflowId(wf.id);
      setRun(null);
      setSaveState("idle");
      const url = new URL(window.location.href);
      url.searchParams.set("wf", wf.id);
      window.history.replaceState(null, "", url);
      loaded.current = true;
      api.listWorkflows().then((l) => setWorkflowList(l.workflows), () => setWorkflowList([]));
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
      await api.saveWorkflow(workflowId, { graph: fromFlow(latest.current.nodes, latest.current.edges) });
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
        .then(setRun)
        .catch((e: unknown) => setProblem(`Mất kết nối khi theo dõi lần chạy: ${e instanceof Error ? e.message : String(e)}`));
    }, POLL_MS);
    return () => clearInterval(t);
  }, [active, run]);

  const runNow = useCallback(async () => {
    if (!workflowId) return;
    setProblem(null);
    try {
      await save();
      const { runId } = await api.startRun(workflowId);
      setRun({ id: runId, status: "queued", error: null, nodes: {} });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  }, [workflowId, save]);

  const isValidConnection: IsValidConnection<Edge> = useCallback(
    (conn) => connectionProblem(conn, latest.current.nodes, latest.current.edges) === null,
    [],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      const why = connectionProblem(conn, latest.current.nodes, latest.current.edges);
      if (why) {
        setProblem(why);
        return;
      }
      setEdges((eds) => addEdge({ ...conn, id: `e-${conn.source}-${conn.sourceHandle}-${conn.target}-${conn.targetHandle}` }, eds));
    },
    [setEdges],
  );

  const addNode = (type: string) => {
    const impl = webNodes[type];
    if (!impl) return;
    const n = latest.current.nodes.length;
    const id = `${type}-${Date.now().toString(36)}`;
    setNodes((ns) => [...ns, { id, type, position: { x: 80 + n * 40, y: 360 + n * 30 }, data: { params: { ...(impl.definition.defaults as Record<string, unknown>) } } }]);
  };

  const editorApi: EditorApi = useMemo(
    () => ({
      setParams: (nodeId, patch) =>
        setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, ...patch } } } : n))),
      stateOf: (nodeId) => run?.nodes[nodeId],
    }),
    [run, setNodes],
  );

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
          <span className={`run-state ${run?.status ?? ""}`} data-testid="run-status">
            {run ? RUN_LABEL[run.status] : ""}
          </span>
          <button type="button" className="primary" data-testid="run-button" disabled={!workflowId || active} onClick={() => void runNow()}>
            {active ? "Đang chạy…" : "▶ Chạy"}
          </button>
        </div>
        {problem || run?.error ? (
          <div className="banner" data-testid="problem-banner">
            {problem ?? run?.error}
            <button type="button" onClick={() => setProblem(null)}>
              Đóng
            </button>
          </div>
        ) : null}
        <div className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
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
