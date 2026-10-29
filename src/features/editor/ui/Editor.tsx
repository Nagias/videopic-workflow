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
import type { ExpandScenesBody, MuseAccountsResponse, RunResponse, WorkflowListResponse, WorkflowResponse } from "../../../shared/api";
import { WORKFLOW_TEMPLATES } from "../../../shared/templates";
import type { WorkflowGroup } from "../../../shared/workflow";
import { connectionProblem, droppedConnectionProblem, edgeKindClass, fromFlow, replaceTargetEdges, targetAcceptsMany, toFlow } from "./graph-convert";
import { GraphNode, type FlowNode } from "./GraphNode";
import { inheritProvider, placeNewNode } from "./new-node";
import { writersFinished } from "./run-sync";
import { EditorContext, type EditorApi } from "./node-kit";

const nodeTypes = Object.fromEntries(Object.keys(webNodes).map((t) => [t, GraphNode]));
const SAVE_DELAY_MS = 600;
const POLL_MS = 1000;
// Sau lần chạy, người dùng vẫn đang sửa trong lúc tải đồ thị: lưu rồi tải lại, tối đa ngần này lần.
const SYNC_TRIES = 5;

const isActive = (r: RunResponse | null) => r !== null && (r.status === "queued" || r.status === "running");
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

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
  // Đang tải lại đồ thị từ máy chủ (sau lần chạy, sau Tạo thẻ cảnh / Thay / Giữ): chưa cho chạy để không lưu đè bản cũ.
  const [syncing, setSyncing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Lời báo của máy chủ khi mở workflow (chuyển workflow cũ bị lỗi).
  const [notice, setNotice] = useState<string | null>(null);
  // Hướng dẫn bước tiếp theo sau khi chọn Thay/Giữ.
  const [info, setInfo] = useState<string | null>(null);
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
  const saving = useRef<Promise<unknown> | null>(null);
  // Đồ thị (dạng JSON như gửi lên) lần cuối tải về hoặc lưu xong. Canvas đổi mà đồ thị không đổi (đo kích thước node khi
  // ảnh hiện ra, chọn node) thì không lưu: tránh gửi bản cũ đè nhóm thẻ cảnh máy chủ vừa tạo lại trong lúc chạy.
  const savedGraph = useRef("");
  // Biên kịch đã tải lại đồ thị giữa lần chạy (mỗi Biên kịch một lần mỗi lần chạy).
  const reloadedWriters = useRef<{ runId: string | null; ids: Set<string> }>({ runId: null, ids: new Set() });
  const latest = useRef({ nodes, edges });
  latest.current = { nodes, edges };
  // Nhóm (Phân cảnh) của workflow đang mở: canvas chưa sửa nhóm, nhưng lưu phải giữ nguyên để Biên kịch còn tạo lại được.
  const groups = useRef<WorkflowGroup[]>([]);

  const [workflowList, setWorkflowList] = useState<WorkflowListResponse["workflows"]>([]);

  // Hiện đồ thị máy chủ trả về (thay đồ thị trên canvas).
  const applyGraph = useCallback(
    (wf: WorkflowResponse) => {
      loaded.current = false;
      const flow = toFlow(wf.graph);
      groups.current = wf.graph.groups;
      savedGraph.current = JSON.stringify(fromFlow(flow.nodes, flow.edges, wf.graph.groups));
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setNotice(wf.notice ?? null);
      loaded.current = true;
    },
    [setNodes, setEdges],
  );

  const showWorkflow = useCallback(
    (wf: WorkflowResponse) => {
      applyGraph(wf);
      setWorkflowId(wf.id);
      // Xoá ngay (không chờ render): lần hỏi tiến độ về muộn của workflow trước không được gộp vào workflow này.
      currentRun.current = null;
      setRun(null);
      setRunFromHistory(false);
      setInfo(null);
      shownWorkflow.current = wf.id;
      setSaveState("idle");
      const url = new URL(window.location.href);
      url.searchParams.set("wf", wf.id);
      window.history.replaceState(null, "", url);
      api.listWorkflows().then((l) => setWorkflowList(l.workflows), () => setWorkflowList([]));
      api.getLatestRun(wf.id).then(
        ({ run: last, nodes }) => {
          // Đã đổi sang workflow khác, hoặc đã bấm Chạy trong lúc chờ: bỏ kết quả cũ.
          if (shownWorkflow.current !== wf.id || !last || currentRun.current) return;
          // Mỗi node hiện kết quả mới nhất của nó qua mọi lần chạy (lần gần nhất có thể chỉ chạy một phần).
          setRun({ ...last, nodes });
          setRunFromHistory(true);
        },
        (e: unknown) => setProblem(`Không tải được kết quả lần chạy trước: ${errText(e)}`),
      );
    },
    [applyGraph],
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
    const graph = fromFlow(latest.current.nodes, latest.current.edges, groups.current);
    const pending = api.saveWorkflow(workflowId, { graph });
    saving.current = pending;
    // Ghi nhận ngay lúc gửi: sửa rồi sửa ngược về đúng bản đang gửi trong lúc chờ thì không cần lưu thêm lần nữa.
    const before = savedGraph.current;
    const sent = JSON.stringify(graph);
    savedGraph.current = sent;
    try {
      await pending;
      setSaveState("saved");
    } catch (e) {
      if (savedGraph.current === sent) savedGraph.current = before;
      setSaveState("error");
      throw e;
    } finally {
      if (saving.current === pending) saving.current = null;
    }
  }, [workflowId]);

  // Lưu ngay sửa đổi đang chờ (hoặc chờ lần lưu đang gửi) trước khi lấy đồ thị từ máy chủ.
  const flushEdits = useCallback(async () => {
    if (saveTimer.current) await save();
    else if (saving.current) await saving.current;
  }, [save]);

  // Máy chủ có thể đã tạo lại nhóm thẻ cảnh: lưu sửa đổi đang chờ rồi tải đồ thị máy chủ (canvas không giữ bản cũ để lần
  // lưu sau ghi đè). Có sửa thêm trong lúc tải thì lưu rồi tải lại (không đè sửa đổi bằng bản máy chủ). withResults: tải cả
  // kết quả mới nhất của từng node (sau khi chạy xong). Không tải được vì vẫn đang sửa thì ném lỗi.
  const reloadGraph = useCallback(
    async (id: string, runId: string, withResults: boolean) => {
      for (let i = 0; i < SYNC_TRIES; i++) {
        await flushEdits();
        const [wf, last] = await Promise.all([api.getWorkflow(id), withResults ? api.getLatestRun(id) : Promise.resolve(null)]);
        if (shownWorkflow.current !== id) return;
        if (saveTimer.current !== null || saving.current !== null) continue;
        applyGraph(wf);
        if (last) setRun((cur) => (cur?.id === runId ? { ...cur, nodes: last.nodes } : cur));
        return;
      }
      throw new Error("đồ thị trên máy chủ đã đổi nhưng bạn vẫn đang sửa nên chưa tải lại được: chọn lại workflow này để thấy thẻ cảnh mới");
    },
    [flushEdits, applyGraph],
  );

  // Lần chạy vừa xong (xong hoặc lỗi): tải lại đồ thị và kết quả mới nhất. Trong lúc tải nút Chạy bị khoá.
  const syncAfterRun = useCallback(
    async (runId: string) => {
      const id = shownWorkflow.current;
      if (!id) return;
      setSyncing(true);
      try {
        await reloadGraph(id, runId, true);
      } catch (e) {
        setProblem(`Không tải lại được workflow sau lần chạy: ${errText(e)}`);
      } finally {
        setSyncing(false);
      }
    },
    [reloadGraph],
  );

  // Biên kịch xong giữa lần chạy: máy chủ ghi nhóm tạo lại vào db ngay lúc đó, nên tải lại đồ thị ngay (không chờ hết lần
  // chạy, có khi vài phút với Muse) để lần tự lưu sau không gửi nhóm cũ đè lên. Trạng thái lần chạy giữ nguyên.
  const syncMidRun = useCallback(
    (runId: string) => {
      const id = shownWorkflow.current;
      if (!id) return;
      reloadGraph(id, runId, false).catch((e: unknown) => setProblem(`Không tải lại được thẻ cảnh mới trong lúc chạy: ${errText(e)}`));
    },
    [reloadGraph],
  );

  // Tạo/thay nhóm thẻ cảnh của Biên kịch (nút Tạo thẻ cảnh, hộp hỏi Thay/Giữ). Trả true khi máy chủ đã đổi đồ thị.
  const expandScenes = useCallback(
    async (writerId: string, choice?: ExpandScenesBody["choice"]) => {
      const id = shownWorkflow.current;
      if (!id) return false;
      setProblem(null);
      setInfo(null);
      setSyncing(true);
      try {
        await flushEdits();
        const wf = await api.expandScenes(id, writerId, choice);
        if (shownWorkflow.current !== id) return false;
        applyGraph(wf);
        return true;
      } catch (e) {
        setProblem(errText(e));
        return false;
      } finally {
        setSyncing(false);
      }
    },
    [flushEdits, applyGraph],
  );

  useEffect(() => {
    if (!loaded.current || !workflowId) return;
    if (!saveTimer.current && JSON.stringify(fromFlow(nodes, edges, groups.current)) === savedGraph.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save().catch((e: unknown) => setProblem(`Không lưu được: ${errText(e)}`));
    }, SAVE_DELAY_MS);
  }, [nodes, edges, workflowId, save]);

  const active = isActive(run);
  const activeRunId = active ? run?.id : undefined;
  useEffect(() => {
    if (!activeRunId) return;
    const t = setInterval(() => {
      api
        .getRun(activeRunId)
        .then((r) => {
          const prev = currentRun.current;
          // Đã đổi workflow, đã bấm chạy lần khác, hoặc lần hỏi trước đã thấy chạy xong: bỏ.
          if (!prev || prev.id !== r.id || !isActive(prev)) return;
          // Gộp lên kết quả đang hiện: node ngoài phạm vi lần chạy vẫn giữ kết quả lần trước.
          const merged: RunResponse = { ...r, nodes: { ...prev.nodes, ...r.nodes } };
          currentRun.current = merged;
          setRun(merged);
          setRunFromHistory(false);
          if (!isActive(merged)) {
            void syncAfterRun(merged.id);
            return;
          }
          if (reloadedWriters.current.runId !== r.id) reloadedWriters.current = { runId: r.id, ids: new Set() };
          const done = writersFinished(groups.current, r.nodes, reloadedWriters.current.ids);
          if (done.length === 0) return;
          for (const w of done) reloadedWriters.current.ids.add(w);
          syncMidRun(r.id);
        })
        .catch((e: unknown) => setProblem(`Mất kết nối khi theo dõi lần chạy: ${errText(e)}`));
    }, POLL_MS);
    return () => clearInterval(t);
  }, [activeRunId, syncAfterRun, syncMidRun]);

  const runNow = useCallback(async () => {
    if (!workflowId) return;
    setProblem(null);
    setInfo(null);
    setStarting(true);
    try {
      await save();
      const { runId } = await api.startRun(workflowId);
      setRun((prev) => ({ id: runId, status: "queued", error: null, decision: null, nodes: prev?.nodes ?? {} }));
      setRunFromHistory(false);
    } catch (e) {
      setProblem(errText(e));
    } finally {
      setStarting(false);
    }
  }, [workflowId, save]);

  const cancelRun = async () => {
    if (!run) return;
    setCancelling(true);
    try {
      // Kết quả "cancelled" hay "finished" đều để lần hỏi tiến độ tiếp theo hiện trạng thái cuối.
      await api.cancelRun(run.id);
    } catch (e) {
      setProblem(`Không huỷ được lần chạy: ${errText(e)}`);
    } finally {
      setCancelling(false);
    }
  };

  const decide = async (choice: NonNullable<ExpandScenesBody["choice"]>) => {
    const decision = run?.decision;
    if (!decision) return;
    if (!(await expandScenes(decision.writerId, choice))) return;
    setRun((cur) => (cur ? { ...cur, decision: null, error: null } : cur));
    setInfo(
      choice === "keep"
        ? "Đã giữ thẻ cảnh đang có. Bấm ▶ Chạy để chạy tiếp."
        : "Đã thay bằng bộ cảnh mới của Biên kịch (bỏ phần sửa tay). Bấm ▶ Chạy để chạy tiếp.",
    );
  };

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
      busy: isActive(run) || starting || syncing,
      expandScenes: (writerId) => void expandScenes(writerId),
    }),
    [run, setNodes, workflowId, starting, syncing, expandScenes],
  );
  // Hộp hỏi chỉ cho lần chạy xem trực tiếp trong phiên này: lần chạy cũ tải lại có thể đã được trả lời.
  const pendingDecision = run?.decision?.kind === "scenes-edited" && !runFromHistory && !active ? run.decision : null;

  const runLabel = run ? (runFromHistory && !active ? `Lần trước: ${RUN_LABEL[run.status]}` : RUN_LABEL[run.status]) : "";
  const fromHistory = runFromHistory && !active;
  // Lần chạy cũ dừng để hỏi Thay/Giữ: hộp hỏi chỉ hiện cho lần chạy xem trong phiên (lần cũ có thể đã được trả lời),
  // nên chỉ dặn bấm Chạy — Biên kịch vẫn ra bộ cảnh khác thì lần chạy mới sẽ hỏi lại.
  const runError = !run?.error
    ? null
    : fromHistory && run.decision?.kind === "scenes-edited"
      ? "Lần chạy trước dừng vì Biên kịch ra bộ cảnh mới mà thẻ cảnh đã được sửa tay. Bấm ▶ Chạy để chọn Thay hoặc Giữ."
      : fromHistory
        ? `Lần chạy trước lỗi: ${run.error}`
        : run.error;

  const readyMuse = muse?.accounts.filter((a) => a.loggedIn).length ?? 0;

  const switchTo = async (load: () => Promise<WorkflowResponse>) => {
    setProblem(null);
    try {
      if (workflowId) await save();
      showWorkflow(await load());
    } catch (e) {
      setProblem(errText(e));
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
            {Object.entries(webNodes)
              .filter(([, impl]) => !impl.definition.hidden)
              .map(([type, impl]) => (
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
          <button type="button" className="primary" data-testid="run-button" disabled={!workflowId || active || starting || syncing} onClick={() => void runNow()}>
            {active || starting ? "Đang chạy…" : "▶ Chạy"}
          </button>
          {active ? (
            <button type="button" data-testid="cancel-run" disabled={cancelling} onClick={() => void cancelRun()}>
              {cancelling ? "Đang huỷ…" : "Huỷ"}
            </button>
          ) : null}
        </div>
        {notice ? (
          <div className="banner notice" data-testid="workflow-notice">
            {notice}
            <button type="button" onClick={() => setNotice(null)}>
              Đóng
            </button>
          </div>
        ) : null}
        {pendingDecision ? (
          <div className="banner decision" data-testid="scenes-decision">
            <span>
              Biên kịch vừa viết bộ cảnh mới, nhưng các thẻ cảnh của nó đã được sửa tay. <strong>Thay</strong>: dùng bộ cảnh mới (mất phần sửa tay).{" "}
              <strong>Giữ</strong>: giữ thẻ cảnh đang có. Chọn xong bấm ▶ Chạy lại.
            </span>
            <div className="banner-actions">
              <button type="button" data-testid="scenes-replace" disabled={syncing} onClick={() => void decide("replace")}>
                Thay
              </button>
              <button type="button" data-testid="scenes-keep" disabled={syncing} onClick={() => void decide("keep")}>
                Giữ
              </button>
            </div>
          </div>
        ) : null}
        {info ? (
          <div className="banner decision">
            {info}
            <button type="button" onClick={() => setInfo(null)}>
              Đóng
            </button>
          </div>
        ) : null}
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
