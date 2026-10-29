import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../core/app-deps";
import { runNodes, runs } from "../../core/db/schema";
import { RunDecisionSchema, type CancelRunResponse, type LatestRunResponse, type RunNodeState, type RunResponse } from "../../shared/api";
import { NodeOutputsSchema } from "../../shared/ports";
import { WorkflowGraphSchema, type WorkflowGraph } from "../../shared/workflow";
import { getWorkflowRow } from "../workflows/store";
import { OLD_RESULT_MESSAGE } from "../workflows/upgrade";
import { freshResults, graphRules, newestRows } from "./fresh-results";

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const BROKEN_OUTPUT = "Kết quả đã lưu của lần chạy này không đọc được — bấm Chạy để tạo lại (bước con đã có thì không tốn lượt)";

// Một dòng run_nodes cho giao diện. output_json hỏng (dữ liệu cũ) thì không có output và báo rõ ở node, không làm hỏng cả trang.
function toNodeState(r: typeof runNodes.$inferSelect): RunNodeState {
  const base = { status: r.status, message: r.message, error: r.error };
  if (!r.outputJson) return { ...base, output: null };
  let raw: unknown;
  try {
    raw = JSON.parse(r.outputJson);
  } catch {
    return { ...base, output: null, error: BROKEN_OUTPUT };
  }
  const parsed = NodeOutputsSchema.safeParse(raw);
  return parsed.success ? { ...base, output: parsed.data } : { ...base, output: null, error: BROKEN_OUTPUT };
}

function toRunResponse(deps: AppDeps, run: typeof runs.$inferSelect): RunResponse {
  const rows = deps.db.select().from(runNodes).where(eq(runNodes.runId, run.id)).all();
  const nodes: Record<string, RunNodeState> = {};
  for (const r of rows) nodes[r.nodeId] = toNodeState(r);
  const decision = run.decisionJson ? RunDecisionSchema.parse(JSON.parse(run.decisionJson)) : null;
  return { id: run.id, status: run.status, error: run.error, decision, nodes };
}

export function registerRunRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get<{ Params: { id: string } }>("/api/runs/:id", async (req, reply) => {
    const run = deps.db.select().from(runs).where(eq(runs.id, req.params.id)).get();
    if (!run) return reply.code(404).send({ error: "Không tìm thấy lần chạy" });
    return toRunResponse(deps, run);
  });

  // Huỷ lượt chạy (spec mục 6.6): đang xếp hàng thì bỏ; đang chạy thì không gửi thêm việc mới, việc dịch vụ đang làm dở bị bỏ.
  app.post<{ Params: { id: string } }>("/api/runs/:id/cancel", async (req, reply) => {
    const result = deps.queue.cancel(req.params.id);
    if (result === "not_found") return reply.code(404).send({ error: "Không tìm thấy lần chạy" });
    const res: CancelRunResponse = { result };
    return res;
  });

  // Mở lại workflow thì giao diện hiện lại ảnh/phim: `run` là lần chạy gần nhất (kể cả đang chạy dở, `run.nodes` là ghi chép
  // nguyên của lần đó); `nodes` là, với mỗi node của workflow hiện tại, dòng mới nhất của nó trong mọi lần chạy (theo thời điểm
  // tạo run, rồi thời điểm cập nhật dòng), để chạy một phần không làm mất kết quả của node ngoài phạm vi (spec mục 6.3).
  // Chỉ giữ kết quả còn đúng với workflow đang lưu (freshResults): khoá cache của dòng phải đúng bằng khoá cache tính lại từ đồ thị
  // hiện tại (tham số, take, nguồn mới hơn, dây, thứ tự clip); dòng không khoá và dòng của lần chạy hiển thị của workflow cũ thì kiểm
  // yếu hơn bằng đồ thị của lần chạy đó (runs.graph_json, xem fresh-results.ts). Node khác thì vắng ở `nodes` (giao diện hiện
  // "Chưa chạy"); những node từng có kết quả mà bị bỏ nằm ở `outdated`.
  app.get<{ Params: { id: string } }>("/api/workflows/:id/runs/latest", async (req, reply) => {
    const wf = getWorkflowRow(deps.db, req.params.id);
    if (!wf) return reply.code(404).send({ error: "Không tìm thấy workflow" });
    const run = deps.db.select().from(runs).where(eq(runs.workflowId, wf.id)).orderBy(desc(runs.createdAt)).limit(1).get();
    const graph = WorkflowGraphSchema.parse(JSON.parse(wf.graphJson));
    const ids = graph.nodes.map((n) => n.id);
    const rows =
      ids.length === 0
        ? []
        : deps.db
            .select({ row: runNodes })
            .from(runNodes)
            .innerJoin(runs, eq(runs.id, runNodes.runId))
            .where(and(eq(runs.workflowId, wf.id), inArray(runNodes.nodeId, ids)))
            .orderBy(desc(runs.createdAt), desc(runNodes.updatedAt))
            .all();
    const allRows = rows.map(({ row }) => ({
      nodeId: row.nodeId,
      runId: row.runId,
      cacheKey: row.cacheKey,
      status: row.status,
      outputJson: row.outputJson,
      state: row,
    }));
    // Đồ thị của lần chạy chỉ cần cho các lần chạy có dòng mới nhất của một node (đủ cho cả so khoá: khoá của nguồn trong lần chạy
    // của một node là dòng của chính lần chạy đó, đã nằm trong `allRows`).
    const runIds = [...new Set([...newestRows(allRows, graph).values()].map((r) => r.runId))];
    const runGraphs = new Map<string, WorkflowGraph>();
    if (runIds.length > 0) {
      for (const r of deps.db.select({ id: runs.id, graphJson: runs.graphJson }).from(runs).where(inArray(runs.id, runIds)).all()) {
        const parsed = WorkflowGraphSchema.safeParse(safeJson(r.graphJson));
        if (parsed.success) runGraphs.set(r.id, parsed.data);
      }
    }
    // Lần chạy hiển thị của workflow cũ: có dòng mang OLD_RESULT_MESSAGE (writeDisplayRun()), xét mọi dòng của lần đó kể cả node
    // đã xoá khỏi workflow.
    const displayRuns = new Set(
      runIds.length === 0
        ? []
        : deps.db
            .selectDistinct({ runId: runNodes.runId })
            .from(runNodes)
            .where(and(inArray(runNodes.runId, runIds), eq(runNodes.message, OLD_RESULT_MESSAGE)))
            .all()
            .map((r) => r.runId),
    );
    const { shown, outdated, unplannable } = freshResults(allRows, runGraphs, displayRuns, graph, graphRules(deps.nodes));
    if (unplannable !== null) req.log.warn({ workflowId: wf.id, reason: unplannable }, "runs/latest: đồ thị hiện tại chưa lập được kế hoạch, lọc kết quả bằng nhánh kiểm yếu");
    const nodes = Object.fromEntries([...shown].map(([id, row]) => [id, toNodeState(row)]));
    const res: LatestRunResponse = { run: run ? toRunResponse(deps, run) : null, nodes, outdated };
    return res;
  });
}
