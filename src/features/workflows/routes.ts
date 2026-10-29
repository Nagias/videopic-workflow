import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../core/app-deps";
import { estimateRun } from "../../core/estimate";
import { GraphError } from "../../core/executor";
import { runNodes, runs, workflows } from "../../core/db/schema";
import { ExpandScenesBodySchema, RunRequestBodySchema, SaveWorkflowBodySchema, type RunScope, type WorkflowListResponse } from "../../shared/api";
import { NodeOutputsSchema } from "../../shared/ports";
import { keepWriterGroup, rebuildWriterGroup, writerGroups } from "../../shared/scenes";
import { WORKFLOW_TEMPLATES } from "../../shared/templates";
import { WorkflowGraphSchema, type WorkflowGraph } from "../../shared/workflow";
import { getWorkflowRow, saveWorkflowGraph, toWorkflowResponse } from "./store";
import { upgradeWorkflowOnOpen } from "./upgrade";

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

export function registerWorkflowRoutes(app: FastifyInstance, deps: AppDeps): void {
  const get = (id: string) => getWorkflowRow(deps.db, id);

  // Kết quả Biên kịch mới nhất của workflow (mọi lần chạy), kèm khoá cache để nhóm cảnh ghi nhớ nó sinh từ kết quả nào.
  const latestWriterResult = (workflowId: string, writerId: string) => {
    const row = deps.db
      .select({ cacheKey: runNodes.cacheKey, outputJson: runNodes.outputJson })
      .from(runNodes)
      .innerJoin(runs, eq(runs.id, runNodes.runId))
      .where(and(eq(runs.workflowId, workflowId), eq(runNodes.nodeId, writerId), inArray(runNodes.status, ["succeeded", "cached"])))
      .orderBy(desc(runNodes.updatedAt), desc(runs.createdAt))
      .limit(1)
      .get();
    if (!row?.cacheKey || !row.outputJson) return undefined;
    const shots = NodeOutputsSchema.parse(JSON.parse(row.outputJson)).shots;
    return shots?.kind === "shotlist" ? { key: row.cacheKey, shots: shots.shots } : undefined;
  };

  app.get("/api/workflows/default", () => {
    const row = get(DEFAULT_WORKFLOW_ID);
    return row ? upgradeWorkflowOnOpen(deps.db, row, (err) => app.log.error(err)) : toWorkflowResponse(saveWorkflowGraph(deps.db, DEFAULT_WORKFLOW_ID, DEFAULT_GRAPH, "Workflow đầu tiên"));
  });

  app.get("/api/workflows", () => {
    const rows = deps.db.select({ id: workflows.id, name: workflows.name, updatedAt: workflows.updatedAt }).from(workflows).all();
    const res: WorkflowListResponse = { workflows: rows.sort((a, b) => b.updatedAt - a.updatedAt) };
    return res;
  });

  app.get<{ Params: { id: string } }>("/api/workflows/:id", async (req, reply) => {
    const row = get(req.params.id);
    if (!row) return reply.code(404).send({ error: "Không tìm thấy workflow" });
    // Workflow cũ (có Dựng phim) chuyển sang Cảnh + Ghép phim ngay lúc mở, một lần, không tốn lượt (upgrade.ts).
    return upgradeWorkflowOnOpen(deps.db, row, (err) => app.log.error(err));
  });

  app.post<{ Params: { templateId: string } }>("/api/workflows/from-template/:templateId", async (req, reply) => {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === req.params.templateId);
    if (!tpl) return reply.code(404).send({ error: "Không có mẫu workflow này" });
    const row = saveWorkflowGraph(deps.db, `${tpl.id}-${Date.now().toString(36)}`, tpl.graph, tpl.name);
    return reply.code(201).send(toWorkflowResponse(row));
  });

  app.put<{ Params: { id: string } }>("/api/workflows/:id", async (req, reply) => {
    const body = SaveWorkflowBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: `Workflow không hợp lệ: ${body.error.issues[0]?.message ?? ""}` });
    return toWorkflowResponse(saveWorkflowGraph(deps.db, req.params.id, body.data.graph, body.data.name));
  });

  // Tạo thẻ cảnh từ kết quả Biên kịch mới nhất: thay (hoặc tạo) nhóm Phân cảnh, hoặc giữ thẻ đang có (spec mục 5.4).
  app.post<{ Params: { id: string } }>("/api/workflows/:id/scenes", async (req, reply) => {
    const body = ExpandScenesBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: `Yêu cầu không hợp lệ: ${body.error.issues[0]?.message ?? ""}` });
    const row = get(req.params.id);
    if (!row) return reply.code(404).send({ error: "Không tìm thấy workflow" });
    const { writerId, choice = "replace" } = body.data;
    const graph = WorkflowGraphSchema.parse(JSON.parse(row.graphJson));
    if (graph.nodes.find((n) => n.id === writerId)?.type !== "writer") return reply.code(404).send({ error: `Không có node Biên kịch "${writerId}" trong workflow` });
    const result = latestWriterResult(row.id, writerId);
    if (!result) return reply.code(409).send({ error: "Biên kịch chưa có kết quả: bấm Chạy trước" });

    const groups = writerGroups(graph, writerId);
    let next: WorkflowGraph = graph;
    if (choice === "keep") {
      if (groups.length === 0) return reply.code(409).send({ error: "Biên kịch này chưa có thẻ cảnh nào để giữ" });
      for (const g of groups) next = keepWriterGroup(next, g.id, result.key);
    } else if (groups.length === 0) {
      next = rebuildWriterGroup(next, { writerId, shots: result.shots, resultKey: result.key }).graph;
    } else {
      for (const g of groups) next = rebuildWriterGroup(next, { writerId, groupId: g.id, shots: result.shots, resultKey: result.key }).graph;
    }
    return toWorkflowResponse(saveWorkflowGraph(deps.db, row.id, next));
  });

  // Thân { scope? } của chạy và ước tính: workflow đang lưu + phạm vi đã kiểm (node phải có trong workflow).
  const runRequest = (id: string, body: unknown): { error: string; code: 400 | 404 } | { workflowId: string; graph: WorkflowGraph; scope: RunScope } => {
    const parsed = RunRequestBodySchema.safeParse(body ?? {});
    if (!parsed.success) return { code: 400, error: `Phạm vi chạy không hợp lệ: ${parsed.error.issues[0]?.message ?? ""}` };
    const row = get(id);
    if (!row) return { code: 404, error: "Không tìm thấy workflow" };
    const graph = WorkflowGraphSchema.parse(JSON.parse(row.graphJson));
    const scope = parsed.data.scope ?? { mode: "all" };
    if (scope.mode !== "all" && !graph.nodes.some((n) => n.id === scope.nodeId)) return { code: 400, error: `Node "${scope.nodeId}" không có trong workflow` };
    return { workflowId: row.id, graph, scope };
  };

  // Chạy cả workflow (thân {}) hoặc một phần: { scope: { mode: "node" | "downstream", nodeId } } (spec mục 6.3).
  app.post<{ Params: { id: string } }>("/api/workflows/:id/runs", async (req, reply) => {
    const r = runRequest(req.params.id, req.body);
    if ("error" in r) return reply.code(r.code).send({ error: r.error });
    const runId = deps.queue.enqueue(r.workflowId, r.graph, r.scope);
    return reply.code(202).send({ runId });
  });

  // Ước tính lượt cho cùng yêu cầu chạy, trước khi chạy (spec mục 6.5): không gọi dịch vụ, không ghi gì.
  app.post<{ Params: { id: string } }>("/api/workflows/:id/estimate", async (req, reply) => {
    const r = runRequest(req.params.id, req.body);
    if ("error" in r) return reply.code(r.code).send({ error: r.error });
    try {
      return estimateRun(deps, r.graph, r.scope);
    } catch (err) {
      if (err instanceof GraphError) return reply.code(400).send({ error: `Không ước tính được: ${err.message}` });
      throw err;
    }
  });
}
