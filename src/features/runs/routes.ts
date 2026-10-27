import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../core/app-deps";
import { runNodes, runs } from "../../core/db/schema";
import type { RunNodeState, RunResponse } from "../../shared/api";
import { NodeOutputsSchema } from "../../shared/ports";

export function registerRunRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get<{ Params: { id: string } }>("/api/runs/:id", async (req, reply) => {
    const run = deps.db.select().from(runs).where(eq(runs.id, req.params.id)).get();
    if (!run) return reply.code(404).send({ error: "Không tìm thấy lần chạy" });
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
    const res: RunResponse = { id: run.id, status: run.status, error: run.error, nodes };
    return res;
  });
}
