import type { z } from "zod";
import type { AssetKind } from "../shared/node-definition";
import {
  ApiErrorSchema,
  AssetListResponseSchema,
  CancelRunResponseSchema,
  EstimateResponseSchema,
  LatestRunResponseSchema,
  MuseAccountsResponseSchema,
  RunResponseSchema,
  StartRunResponseSchema,
  WorkflowListResponseSchema,
  WorkflowResponseSchema,
  type ExpandScenesBody,
  type RunRequestBody,
  type RunScope,
  type SaveWorkflowBody,
} from "../shared/api";

async function call<S extends z.ZodType>(schema: S, url: string, init?: RequestInit): Promise<z.infer<S>> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ApiErrorSchema.safeParse(body);
    throw new Error(err.success ? err.data.error : `Máy chủ trả lỗi ${res.status}`);
  }
  return schema.parse(body);
}

const runBody = (scope?: RunScope): RunRequestBody => (scope ? { scope } : {});

export const api = {
  getDefaultWorkflow: () => call(WorkflowResponseSchema, "/api/workflows/default"),
  getWorkflow: (id: string) => call(WorkflowResponseSchema, `/api/workflows/${encodeURIComponent(id)}`),
  listWorkflows: () => call(WorkflowListResponseSchema, "/api/workflows"),
  createFromTemplate: (templateId: string) =>
    call(WorkflowResponseSchema, `/api/workflows/from-template/${encodeURIComponent(templateId)}`, { method: "POST", body: "{}" }),
  saveWorkflow: (id: string, body: SaveWorkflowBody) =>
    call(WorkflowResponseSchema, `/api/workflows/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  // Không truyền scope: chạy cả workflow.
  startRun: (workflowId: string, scope?: RunScope) =>
    call(StartRunResponseSchema, `/api/workflows/${encodeURIComponent(workflowId)}/runs`, { method: "POST", body: JSON.stringify(runBody(scope)) }),
  estimate: (workflowId: string, scope?: RunScope) =>
    call(EstimateResponseSchema, `/api/workflows/${encodeURIComponent(workflowId)}/estimate`, { method: "POST", body: JSON.stringify(runBody(scope)) }),
  cancelRun: (runId: string) => call(CancelRunResponseSchema, `/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", body: "{}" }),
  expandScenes: (workflowId: string, writerId: string, choice?: ExpandScenesBody["choice"]) =>
    call(WorkflowResponseSchema, `/api/workflows/${encodeURIComponent(workflowId)}/scenes`, {
      method: "POST",
      body: JSON.stringify({ writerId, ...(choice ? { choice } : {}) } satisfies ExpandScenesBody),
    }),
  getRun: (runId: string) => call(RunResponseSchema, `/api/runs/${encodeURIComponent(runId)}`),
  getLatestRun: (workflowId: string) => call(LatestRunResponseSchema, `/api/workflows/${encodeURIComponent(workflowId)}/runs/latest`),
  getMuseAccounts: () => call(MuseAccountsResponseSchema, "/api/muse/accounts"),
  listAssets: (kind: AssetKind) => call(AssetListResponseSchema, `/api/assets?kind=${encodeURIComponent(kind)}`),
};
