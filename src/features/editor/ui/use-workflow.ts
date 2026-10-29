import { useEdgesState, useNodesState, type Edge } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, SaveTimeoutError, WorkflowConflictError } from "../../../app/api-client";
import type { LatestRunResponse, WorkflowListResponse, WorkflowResponse } from "../../../shared/api";
import type { WorkflowGroup } from "../../../shared/workflow";
import { fromFlow, graphText, toFlow } from "./graph-convert";
import { GraphReplacedError, graphWasReplaced, reloadFromServer } from "./reload-graph";
import type { FlowNode } from "./GraphNode";

const SAVE_DELAY_MS = 600;
// Sau lần chạy, người dùng vẫn đang sửa trong lúc tải đồ thị: lưu rồi tải lại, tối đa ngần này lần.
const SYNC_TRIES = 5;

const noop = () => undefined;

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type SaveState = "idle" | "saving" | "saved" | "error";

// Tải, mở và tự lưu workflow. Giữ đồ thị trên canvas (nodes/edges), nhóm (groups) và bản đã lưu (savedGraph).
export function useWorkflow() {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  // Lời báo của máy chủ khi mở workflow (chuyển workflow cũ bị lỗi).
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [workflowList, setWorkflowList] = useState<WorkflowListResponse["workflows"]>([]);
  const shownWorkflow = useRef<string | null>(null);
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<unknown> | null>(null);
  // Đồ thị (dạng JSON như gửi lên) lần cuối tải về hoặc lưu xong. Canvas đổi mà đồ thị không đổi (đo kích thước node khi
  // ảnh hiện ra, chọn node) thì không lưu: tránh gửi bản cũ đè nhóm thẻ cảnh máy chủ vừa tạo lại trong lúc chạy.
  const savedGraph = useRef("");
  // updatedAt của bản máy chủ lần cuối tải về hoặc lưu xong, gửi kèm mỗi lần lưu (baseUpdatedAt): máy chủ đã ghi bản khác từ đó
  // (Biên kịch tạo lại thẻ cảnh) thì từ chối thay vì đè.
  const baseUpdatedAt = useRef<number | undefined>(undefined);
  // Tăng mỗi khi canvas bị thay bằng đồ thị máy chủ: lần lưu xếp hàng từ trước đó không được gửi canvas cũ lên nữa.
  const graphVersion = useRef(0);
  // Chữ đồ thị của lần lưu gần nhất bị huỷ vì quá hạn (SaveTimeoutError): máy chủ có thể vẫn đã ghi nó. Lần lưu sau bị từ chối 409 mà
  // bản máy chủ đúng là bản này thì đó là bản của chính mình: nhận updatedAt của nó làm nền và gửi lại, không thay canvas.
  const unconfirmed = useRef<string | null>(null);
  const latest = useRef({ nodes, edges });
  // Gán ngay trong lúc render (không đợi useEffect): save() và "Chạy lại (bản mới)" (Editor.rerunNode: flushSync rồi startRun → save()) đọc
  // `latest.current` ngay sau khi canvas đổi, nên nó phải đã mang đồ thị vừa render.
  latest.current = { nodes, edges };
  // Nhóm của workflow đang mở: nhóm Phân cảnh canvas không sửa nhưng lưu phải giữ nguyên để Biên kịch còn tạo lại được; nhóm tay
  // (Ctrl+G, rút node bị xoá) thì sửa qua setGroups(). `groups` (ref) là giá trị mới nhất cho hàm gọi sau,
  // `groupList` (state) để giao diện vẽ khung và để tự lưu chạy lại khi nhóm đổi. Hai cái luôn đổi cùng nhau.
  const [groupList, setGroupList] = useState<WorkflowGroup[]>([]);
  const groups = useRef<WorkflowGroup[]>([]);
  const setGroups = useCallback((next: WorkflowGroup[]) => {
    groups.current = next;
    setGroupList(next);
  }, []);
  // Gọi mỗi khi một workflow vừa được mở: useRun đặt hàm dọn kết quả lần chạy cũ và tải lần chạy gần nhất.
  const onShown = useRef<((id: string) => void) | null>(null);

  // Hiện đồ thị máy chủ trả về (thay đồ thị trên canvas).
  const applyGraph = useCallback(
    (wf: WorkflowResponse) => {
      loaded.current = false;
      baseUpdatedAt.current = wf.updatedAt;
      graphVersion.current++;
      const flow = toFlow(wf.graph);
      setGroups(wf.graph.groups);
      savedGraph.current = graphText(wf.graph);
      // Cùng workflow được tải lại (sau lần chạy, sau 409): node đang chọn vẫn chọn, khung bên phải không đóng. Mở workflow khác thì bỏ chọn.
      const sameWorkflow = shownWorkflow.current === wf.id;
      setNodes((prev) => {
        const picked = new Set(sameWorkflow ? prev.filter((n) => n.selected).map((n) => n.id) : []);
        // Thẻ cùng mã vẫn đang gắn trên canvas nên giữ kích thước đã đo: node mới không có `measured` thì xyflow coi là chưa đo và ẩn thẻ,
        // mà ResizeObserver chỉ báo lại khi kích thước THAY ĐỔI, nên thẻ giữ nguyên kích thước sẽ ẩn mãi (thẻ cảnh biến mất sau lần chạy).
        const measured = new Map(prev.map((n) => [n.id, n.measured]));
        return flow.nodes.map((n) => {
          const size = measured.get(n.id);
          const kept = size ? { ...n, measured: size } : n;
          return picked.has(n.id) ? { ...kept, selected: true } : kept;
        });
      });
      setEdges(flow.edges);
      setNotice(wf.notice ?? null);
      loaded.current = true;
    },
    [setNodes, setEdges, setGroups],
  );

  const showWorkflow = useCallback(
    (wf: WorkflowResponse) => {
      unconfirmed.current = null;
      applyGraph(wf);
      setWorkflowId(wf.id);
      shownWorkflow.current = wf.id;
      onShown.current?.(wf.id);
      setSaveState("idle");
      const url = new URL(window.location.href);
      url.searchParams.set("wf", wf.id);
      window.history.replaceState(null, "", url);
      api.listWorkflows().then((l) => setWorkflowList(l.workflows), () => setWorkflowList([]));
    },
    [applyGraph],
  );

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("wf");
    (wanted ? api.getWorkflow(wanted).catch(() => api.getDefaultWorkflow()) : api.getDefaultWorkflow())
      .then(showWorkflow)
      .catch((e: unknown) => setProblem(`Không tải được workflow: ${errText(e)}`));
  }, [showWorkflow]);

  // Các lần lưu nối đuôi nhau (lần sau chờ lần trước xong để lấy updatedAt mới làm nền). Máy chủ đã giữ bản khác (409):
  // hiện đồ thị máy chủ thay canvas, báo lên thanh báo, rồi ném lỗi để chỗ gọi (chạy, đổi workflow) dừng lại.
  const save = useCallback((): Promise<void> => {
    if (!workflowId) return Promise.resolve();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    setSaveState("saving");
    const previous = saving.current;
    const version = graphVersion.current;
    const job = async () => {
      // Lỗi của lần lưu trước đã báo ở chỗ gọi nó; lần này chỉ cần biết nó đã xong.
      if (previous) await previous.then(noop, noop);
      if (graphVersion.current !== version) {
        // Canvas đã bị thay bằng đồ thị máy chủ: không gửi bản canvas cũ lên, và báo để chỗ gọi (chạy, đổi workflow) dừng lại.
        setSaveState("idle");
        throw new GraphReplacedError();
      }
      const graph = fromFlow(latest.current.nodes, latest.current.edges, groups.current);
      // Ghi nhận ngay lúc gửi: sửa rồi sửa ngược về đúng bản đang gửi trong lúc chờ thì không cần lưu thêm lần nữa.
      const before = savedGraph.current;
      const sent = JSON.stringify(graph);
      savedGraph.current = sent;
      const send = () => api.saveWorkflow(workflowId, { graph, ...(baseUpdatedAt.current === undefined ? {} : { baseUpdatedAt: baseUpdatedAt.current }) });
      try {
        let saved: WorkflowResponse;
        try {
          saved = await send();
        } catch (e) {
          // Bản máy chủ "mới hơn" chính là lần lưu quá hạn trước của canvas này (đã tới nơi, chỉ câu trả lời bị huỷ): gửi lại trên nền đó.
          if (!(e instanceof WorkflowConflictError) || unconfirmed.current === null || graphText(e.workflow.graph) !== unconfirmed.current) throw e;
          baseUpdatedAt.current = e.workflow.updatedAt;
          unconfirmed.current = null;
          saved = await send();
        }
        unconfirmed.current = null;
        if (baseUpdatedAt.current === undefined || saved.updatedAt >= baseUpdatedAt.current) baseUpdatedAt.current = saved.updatedAt;
        setSaveState("saved");
      } catch (e) {
        if (e instanceof SaveTimeoutError) unconfirmed.current = sent;
        if (e instanceof WorkflowConflictError) {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = null;
          applyGraph(e.workflow);
          setProblem(e.message);
          setSaveState("idle");
          throw e;
        }
        if (savedGraph.current === sent) savedGraph.current = before;
        setSaveState("error");
        throw e;
      }
    };
    const run: Promise<void> = job().finally(() => {
      if (saving.current === run) saving.current = null;
    });
    saving.current = run;
    return run;
  }, [workflowId, applyGraph]);

  // Lưu ngay sửa đổi đang chờ (hoặc chờ lần lưu đang gửi) trước khi lấy đồ thị từ máy chủ.
  const flushEdits = useCallback(async () => {
    if (saveTimer.current) await save();
    else if (saving.current) await saving.current;
  }, [save]);

  // Máy chủ có thể đã tạo lại nhóm thẻ cảnh: lưu sửa đổi đang chờ rồi tải đồ thị máy chủ (canvas không giữ bản cũ để lần
  // lưu sau ghi đè). Có sửa thêm trong lúc tải thì lưu rồi tải lại (không đè sửa đổi bằng bản máy chủ). withResults: tải cả
  // kết quả mới nhất của từng node (sau khi chạy xong); khi đồ thị đã hiện thì trả kết quả đó để useRun gộp vào lần chạy.
  // Không tải được vì vẫn đang sửa thì ném lỗi.
  const reloadGraph = useCallback(
    async (id: string, withResults: boolean): Promise<LatestRunResponse | null> => {
      const outcome = await reloadFromServer<WorkflowResponse, LatestRunResponse | null>({
        tries: SYNC_TRIES,
        flush: flushEdits,
        load: async () => {
          const [wf, last] = await Promise.all([api.getWorkflow(id), withResults ? api.getLatestRun(id) : Promise.resolve(null)]);
          return { wf, last };
        },
        isShown: () => shownWorkflow.current === id,
        isBusy: () => saveTimer.current !== null || saving.current !== null,
        apply: applyGraph,
      });
      if (outcome.kind === "applied") return outcome.last;
      if (outcome.kind === "stale") return null;
      throw new Error("đồ thị trên máy chủ đã đổi nhưng bạn vẫn đang sửa nên chưa tải lại được: chọn lại workflow này để thấy thẻ cảnh mới");
    },
    [flushEdits, applyGraph],
  );

  useEffect(() => {
    if (!loaded.current || !workflowId) return;
    if (!saveTimer.current && JSON.stringify(fromFlow(nodes, edges, groups.current)) === savedGraph.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save().catch((e: unknown) => {
        // Bản máy chủ mới hơn: save() đã hiện đồ thị mới và báo lên thanh báo rồi.
        if (!graphWasReplaced(e)) setProblem(`Không lưu được: ${errText(e)}`);
      });
    }, SAVE_DELAY_MS);
  }, [nodes, edges, groupList, workflowId, save]);

  // Lưu workflow đang mở rồi mở workflow `load` trả về (chọn workflow khác, tạo từ mẫu).
  const switchTo = async (load: () => Promise<WorkflowResponse>) => {
    setProblem(null);
    try {
      if (workflowId) await save();
      showWorkflow(await load());
    } catch (e) {
      setProblem(errText(e));
    }
  };

  return {
    workflowId,
    workflowList,
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    groups,
    groupList,
    setGroups,
    latest,
    saveState,
    notice,
    setNotice,
    problem,
    setProblem,
    save,
    flushEdits,
    applyGraph,
    reloadGraph,
    switchTo,
    shownWorkflow,
    onShown,
  };
}

export type WorkflowApi = ReturnType<typeof useWorkflow>;
