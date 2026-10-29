import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../core/app-deps";
import { runNodes, runs } from "../../core/db/schema";
import { RunDecisionSchema, type CancelRunResponse, type LatestRunResponse, type RunNodeState, type RunResponse } from "../../shared/api";
import { NodeOutputsSchema } from "../../shared/ports";
import { WorkflowGraphSchema } from "../../shared/workflow";
import { getWorkflowRow } from "../workflows/store";

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

  // Mở lại workflow thì giao diện hiện lại ảnh/phim: `run` là lần chạy gần nhất (kể cả đang chạy dở); `nodes` là, với mỗi node
  // của workflow hiện tại, dòng mới nhất của nó trong mọi lần chạy (theo thời điểm tạo run, rồi thời điểm cập nhật dòng),
  // để chạy một phần không làm mất kết quả của node ngoài phạm vi (spec mục 6.3).
  app.get<{ Params: { id: string } }>("/api/workflows/:id/runs/latest", async (req, reply) => {
    const wf = getWorkflowRow(deps.db, req.params.id);
    if (!wf) return reply.code(404).send({ error: "Không tìm thấy workflow" });
    const run = deps.db.select().from(runs).where(eq(runs.workflowId, wf.id)).orderBy(desc(runs.createdAt)).limit(1).get();
    const ids = WorkflowGraphSchema.parse(JSON.parse(wf.graphJson)).nodes.map((n) => n.id);
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
    const newest = new Map<string, typeof runNodes.$inferSelect>();
    for (const { row } of rows) if (!newest.has(row.nodeId)) newest.set(row.nodeId, row);
    const nodes = Object.fromEntries([...newest].map(([id, row]) => [id, toNodeState(row)]));
    const res: LatestRunResponse = { run: run ? toRunResponse(deps, run) : null, nodes };
    return res;
  });
}
