import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../core/app-deps";
import { runNodes, runs, workflows } from "../../core/db/schema";
import type { LatestRunResponse, RunNodeState, RunResponse } from "../../shared/api";
import { NodeOutputsSchema } from "../../shared/ports";

function toRunResponse(deps: AppDeps, run: typeof runs.$inferSelect): RunResponse {
  const rows = deps.db.select().from(runNodes).where(eq(runNodes.runId, run.id)).all();
  const nodes: Record<string, RunNodeState> = {};
  for (const r of rows) {
    nodes[r.nodeId] = {
      status: r.status,
      message: r.message,
      error: r.error,
      output: r.outputJson ? NodeOutputsSchema.parse(JSON.parse(r.outputJson)) : null,
    };
  }
  return { id: run.id, status: run.status, error: run.error, nodes };
}

export function registerRunRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get<{ Params: { id: string } }>("/api/runs/:id", async (req, reply) => {
    const run = deps.db.select().from(runs).where(eq(runs.id, req.params.id)).get();
    if (!run) return reply.code(404).send({ error: "Không tìm thấy lần chạy" });
    return toRunResponse(deps, run);
  });

  // Mở lại workflow thì giao diện hiện lại ảnh/phim của lần chạy gần nhất (kể cả lần đang chạy dở).
  app.get<{ Params: { id: string } }>("/api/workflows/:id/runs/latest", async (req, reply) => {
    const wf = deps.db.select({ id: workflows.id }).from(workflows).where(eq(workflows.id, req.params.id)).get();
    if (!wf) return reply.code(404).send({ error: "Không tìm thấy workflow" });
    const run = deps.db.select().from(runs).where(eq(runs.workflowId, wf.id)).orderBy(desc(runs.createdAt)).limit(1).get();
    const res: LatestRunResponse = { run: run ? toRunResponse(deps, run) : null };
    return res;
  });
}
