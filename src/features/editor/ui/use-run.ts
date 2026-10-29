import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../app/api-client";
import { groupCombineId, writerGroups } from "../../../shared/scenes";
import type { WorkflowGraph } from "../../../shared/workflow";
import type { ExpandScenesBody, RunNodeState, RunResponse, RunScope } from "../../../shared/api";
import { writersFinished } from "./run-sync";
import { isActive, runView } from "./run-view";
import { errText, type WorkflowApi } from "./use-workflow";

const POLL_MS = 1000;
// Sau mỗi lần "Đã lưu" chờ ngần này rồi mới tải lại kết quả (gõ liên tục thì chỉ tải một lần khi dừng tay), như ô ước tính.
const RESULTS_DELAY_MS = 1000;

const NO_STATES: Record<string, RunNodeState> = {};
const NO_IDS: readonly string[] = [];
const NO_OUTDATED: ReadonlySet<string> = new Set();

// Lượt chạy của workflow đang mở: bắt đầu, hỏi tiến độ, gộp kết quả vào các node, tải lại đồ thị giữa và cuối lượt chạy, huỷ,
// và trả lời hộp hỏi Thay/Giữ của Biên kịch.
export function useRun(wf: WorkflowApi) {
  const { workflowId, shownWorkflow, saveState, groups, onShown, save, flushEdits, applyGraph, reloadGraph, setProblem } = wf;
  const [run, setRun] = useState<RunResponse | null>(null);
  // true khi `run` là lần chạy cũ tải lại lúc mở workflow (chưa xem trực tiếp trong phiên này).
  const [runFromHistory, setRunFromHistory] = useState(false);
  const [starting, setStarting] = useState(false);
  // Đang tải lại đồ thị từ máy chủ (sau lần chạy, sau Tạo thẻ cảnh / Thay / Giữ): chưa cho chạy để không lưu đè bản cũ.
  const [syncing, setSyncing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Các node thuộc lần chạy đang theo dõi (khoá của kết quả hỏi tiến độ: chỉ có node trong phạm vi lần chạy), để hàng chờ đếm xong/tổng.
  const [runNodeIds, setRunNodeIds] = useState<readonly string[]>(NO_IDS);
  // Hướng dẫn bước tiếp theo sau khi chọn Thay/Giữ.
  const [info, setInfo] = useState<string | null>(null);
  // Node từng có kết quả nhưng tham số/đầu vào đã đổi sau lần chạy đó: máy chủ không trả kết quả của chúng (GET .../runs/latest).
  const [outdated, setOutdated] = useState<ReadonlySet<string>>(NO_OUTDATED);
  const currentRun = useRef<RunResponse | null>(null);
  currentRun.current = run;
  // Biên kịch đã tải lại đồ thị giữa lần chạy (mỗi Biên kịch một lần mỗi lần chạy).
  const reloadedWriters = useRef<{ runId: string | null; ids: Set<string> }>({ runId: null, ids: new Set() });

  // Vừa mở một workflow: bỏ kết quả của workflow trước, rồi tải kết quả lần chạy gần nhất của workflow này.
  onShown.current = (id) => {
    // Xoá ngay (không chờ render): lần hỏi tiến độ về muộn của workflow trước không được gộp vào workflow này.
    currentRun.current = null;
    setRun(null);
    setRunNodeIds(NO_IDS);
    setRunFromHistory(false);
    setInfo(null);
    setOutdated(NO_OUTDATED);
    api.getLatestRun(id).then(
      ({ run: last, nodes, outdated: old }) => {
        // Đã đổi sang workflow khác, hoặc đã bấm Chạy trong lúc chờ: bỏ kết quả cũ.
        if (shownWorkflow.current !== id || !last || currentRun.current) return;
        // Mỗi node hiện kết quả mới nhất của nó qua mọi lần chạy (lần gần nhất có thể chỉ chạy một phần).
        setRun({ ...last, nodes });
        setOutdated(new Set(old));
        setRunFromHistory(true);
      },
      (e: unknown) => setProblem(`Không tải được kết quả lần chạy trước: ${errText(e)}`),
    );
  };

  // Lần chạy vừa xong (xong hoặc lỗi): tải lại đồ thị và kết quả mới nhất. Trong lúc tải nút Chạy bị khoá.
  const syncAfterRun = useCallback(
    async (runId: string) => {
      const id = shownWorkflow.current;
      if (!id) return;
      setSyncing(true);
      try {
        const last = await reloadGraph(id, true);
        if (last) {
          setRun((cur) => (cur?.id === runId ? { ...cur, nodes: last.nodes } : cur));
          setOutdated(new Set(last.outdated));
        }
      } catch (e) {
        setProblem(`Không tải lại được workflow sau lần chạy: ${errText(e)}`);
      } finally {
        setSyncing(false);
      }
    },
    [reloadGraph, shownWorkflow, setProblem],
  );

  // Biên kịch xong giữa lần chạy: máy chủ ghi nhóm tạo lại vào db ngay lúc đó, nên tải lại đồ thị ngay (không chờ hết lần
  // chạy, có khi vài phút với Muse) để lần tự lưu sau không gửi nhóm cũ đè lên. Trạng thái lần chạy giữ nguyên.
  const syncMidRun = useCallback(
    () => {
      const id = shownWorkflow.current;
      if (!id) return;
      reloadGraph(id, false).catch((e: unknown) => setProblem(`Không tải lại được thẻ cảnh mới trong lúc chạy: ${errText(e)}`));
    },
    [reloadGraph, shownWorkflow, setProblem],
  );

  // Tải kết quả của workflow `id` từ máy chủ và hiện đúng như máy chủ trả: một nơi quyết định duy nhất kết quả nào còn đúng
  // (GET .../runs/latest, freshResults). Thẻ có tham số/đầu vào khác lần chạy hiện "Chưa chạy" tới lần chạy sau. Mỗi lần gọi làm các
  // lần gọi trước còn đang chờ thành cũ (kết quả về muộn bị bỏ), cả khi đã đổi sang workflow khác. Lỗi thì báo lên thanh báo.
  const fetchSeq = useRef(0);
  const showServerResults = useCallback(
    async (id: string): Promise<void> => {
      const mine = ++fetchSeq.current;
      try {
        const last = await api.getLatestRun(id);
        if (fetchSeq.current !== mine || shownWorkflow.current !== id) return;
        const shown = currentRun.current;
        if (shown) {
          currentRun.current = { ...shown, nodes: last.nodes };
          setRun(currentRun.current);
        }
        setOutdated(new Set(last.outdated));
      } catch (e) {
        setProblem(`Không tải được kết quả của các thẻ cảnh: ${errText(e)}`);
      }
    },
    [shownWorkflow, setProblem],
  );

  // Ẩn kết quả đang hiện của các node `ids` (khi không hỏi được máy chủ): thà hiện "Chưa chạy" còn hơn hiện clip của thẻ cũ.
  const hideResults = useCallback((ids: readonly string[]) => {
    const shown = currentRun.current;
    if (!shown) return;
    const nodes = { ...shown.nodes };
    for (const id of ids) delete nodes[id];
    currentRun.current = { ...shown, nodes };
    setRun(currentRun.current);
  }, []);

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
        const next = await api.expandScenes(id, writerId, choice);
        if (shownWorkflow.current !== id) return false;
        applyGraph(next);
        // Ẩn kết quả của nhóm thẻ vừa đổi TRƯỚC khi hỏi máy chủ; lần tải thành công sẽ hiện lại đúng phần còn đúng. Nhờ vậy kết quả cuối
        // không phụ thuộc lần tải lỗi hay bị lần tải khác chen ngang: thẻ cảnh cũ không bao giờ hiện clip của thẻ cũ.
        hideResults(expandedNodeIds(next.graph, writerId));
        await showServerResults(id);
        return true;
      } catch (e) {
        setProblem(errText(e));
        return false;
      } finally {
        setSyncing(false);
      }
    },
    [flushEdits, applyGraph, showServerResults, hideResults, shownWorkflow, setProblem],
  );

  const active = isActive(run);

  // Sửa tay một thẻ thì kết quả cũ của nó (và Ghép phim phía sau) không còn đúng: lưu xong thì tải lại kết quả, ô ước tính cũng làm vậy.
  // Không tải trong lúc chạy / xin chạy / đồng bộ (lần chạy tự tải lại khi xong).
  const idle = !active && !starting && !syncing;
  useEffect(() => {
    if (!workflowId || saveState !== "saved" || !idle) return;
    const t = setTimeout(() => void showServerResults(workflowId), RESULTS_DELAY_MS);
    return () => {
      clearTimeout(t);
      fetchSeq.current++;
    };
  }, [workflowId, saveState, idle, showServerResults]);

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
          setRunNodeIds(Object.keys(r.nodes));
          setRunFromHistory(false);
          if (!isActive(merged)) {
            void syncAfterRun(merged.id);
            return;
          }
          if (reloadedWriters.current.runId !== r.id) reloadedWriters.current = { runId: r.id, ids: new Set() };
          const done = writersFinished(groups.current, r.nodes, reloadedWriters.current.ids);
          if (done.length === 0) return;
          for (const w of done) reloadedWriters.current.ids.add(w);
          syncMidRun();
        })
        .catch((e: unknown) => setProblem(`Mất kết nối khi theo dõi lần chạy: ${errText(e)}`));
    }, POLL_MS);
    return () => clearInterval(t);
  }, [activeRunId, syncAfterRun, syncMidRun, groups, setProblem]);

  // scope: chỉ chạy một phần workflow; không truyền thì chạy cả workflow.
  const startRun = useCallback(
    async (scope?: RunScope) => {
      if (!workflowId) return;
      setProblem(null);
      setInfo(null);
      setStarting(true);
      try {
        await save();
        const { runId } = await api.startRun(workflowId, scope);
        setRun((prev) => ({ id: runId, status: "queued", error: null, decision: null, nodes: prev?.nodes ?? {} }));
        setRunNodeIds(NO_IDS);
        setRunFromHistory(false);
      } catch (e) {
        setProblem(errText(e));
      } finally {
        setStarting(false);
      }
    },
    [workflowId, save, setProblem],
  );

  const cancel = async () => {
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

  const { fromHistory, pendingDecision, runLabel, runError } = runView(run, runFromHistory);

  return {
    run,
    nodeStates: run?.nodes ?? NO_STATES,
    runNodeIds,
    outdated,
    fromHistory,
    active,
    starting,
    syncing,
    cancelling,
    info,
    setInfo,
    pendingDecision,
    runLabel,
    runError,
    expandScenes,
    startRun,
    cancel,
    decide,
  };
}

// Các node của nhóm thẻ cảnh do Biên kịch `writerId` sinh ra: thẻ cảnh và Ghép phim của nhóm.
function expandedNodeIds(graph: WorkflowGraph, writerId: string): string[] {
  return writerGroups(graph, writerId).flatMap((g) => {
    const combine = groupCombineId(graph, g.id);
    return combine === undefined ? g.nodeIds : [...g.nodeIds, combine];
  });
}

export type RunApi = ReturnType<typeof useRun>;
// Phần của lượt chạy mà các thành phần giao diện (thanh trên, dải báo) được dùng: không có startRun. Muốn chạy thì gọi Editor.runScope,
// chỗ duy nhất xin chạy, để không ai vô tình đi vòng qua nó.
export type RunView = Omit<RunApi, "startRun">;
