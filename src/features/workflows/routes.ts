import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../core/app-deps";
import { workflows } from "../../core/db/schema";
import { SaveWorkflowBodySchema, type WorkflowListResponse, type WorkflowResponse } from "../../shared/api";
import { WORKFLOW_TEMPLATES } from "../../shared/templates";
import { WorkflowGraphSchema, type WorkflowGraph } from "../../shared/workflow";

export const DEFAULT_WORKFLOW_ID = "default";

export const DEFAULT_GRAPH: WorkflowGraph = {
  nodes: [
    {
      id: "prompt-1",
      type: "prompt",
      position: { x: 40, y: 80 },
      params: { text: "A lush primeval rainforest at sunrise, mist drifting between giant trees, slow cinematic dolly forward" },
    },
    { id: "video-1", type: "generate-video", position: { x: 460, y: 60 }, params: { provider: "fake", durationSec: 5 } },
  ],
  edges: [{ id: "e-prompt-1-video-1", source: "prompt-1", sourceHandle: "text", target: "video-1", targetHandle: "prompt" }],
};

function toResponse(row: typeof workflows.$inferSelect): WorkflowResponse {
  return { id: row.id, name: row.name, graph: WorkflowGraphSchema.parse(JSON.parse(row.graphJson)), updatedAt: row.updatedAt };
}

export function registerWorkflowRoutes(app: FastifyInstance, deps: AppDeps): void {
  const get = (id: string) => deps.db.select().from(workflows).where(eq(workflows.id, id)).get();

  app.get("/api/workflows/default", () => {
    let row = get(DEFAULT_WORKFLOW_ID);
    if (!row) {
      row = { id: DEFAULT_WORKFLOW_ID, name: "Workflow đầu tiên", graphJson: JSON.stringify(DEFAULT_GRAPH), updatedAt: Date.now() };
      deps.db.insert(workflows).values(row).run();
    }
    return toResponse(row);
  });

  app.get("/api/workflows", () => {
    const rows = deps.db.select({ id: workflows.id, name: workflows.name, updatedAt: workflows.updatedAt }).from(workflows).all();
    const res: WorkflowListResponse = { workflows: rows.sort((a, b) => b.updatedAt - a.updatedAt) };
    return res;
  });

  app.get<{ Params: { id: string } }>("/api/workflows/:id", async (req, reply) => {
    const row = get(req.params.id);
    if (!row) return reply.code(404).send({ error: "Không tìm thấy workflow" });
    return toResponse(row);
  });

  app.post<{ Params: { templateId: string } }>("/api/workflows/from-template/:templateId", async (req, reply) => {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === req.params.templateId);
    if (!tpl) return reply.code(404).send({ error: "Không có mẫu workflow này" });
    const id = `${tpl.id}-${Date.now().toString(36)}`;
    const row = { id, name: tpl.name, graphJson: JSON.stringify(tpl.graph), updatedAt: Date.now() };
    deps.db.insert(workflows).values(row).run();
    return reply.code(201).send(toResponse(row));
  });

  app.put<{ Params: { id: string } }>("/api/workflows/:id", async (req, reply) => {
    const body = SaveWorkflowBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: `Workflow không hợp lệ: ${body.error.issues[0]?.message ?? ""}` });
    const existing = get(req.params.id);
    const row = {
      id: req.params.id,
      name: body.data.name ?? existing?.name ?? "Workflow",
      graphJson: JSON.stringify(body.data.graph),
      updatedAt: Date.now(),
    };
    deps.db.insert(workflows).values(row).onConflictDoUpdate({ target: workflows.id, set: row }).run();
    return toResponse(row);
  });

  app.post<{ Params: { id: string } }>("/api/workflows/:id/runs", async (req, reply) => {
    const row = get(req.params.id);
    if (!row) return reply.code(404).send({ error: "Không tìm thấy workflow" });
    const runId = deps.queue.enqueue(row.id, WorkflowGraphSchema.parse(JSON.parse(row.graphJson)));
    return reply.code(202).send({ runId });
  });
}
