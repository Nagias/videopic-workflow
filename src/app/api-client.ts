import type { z } from "zod";
import type { AssetKind } from "../shared/node-definition";
import {
  ApiErrorSchema,
  AssetListResponseSchema,
  MuseAccountsResponseSchema,
  RunResponseSchema,
  StartRunResponseSchema,
  WorkflowListResponseSchema,
  WorkflowResponseSchema,
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

export const api = {
  getDefaultWorkflow: () => call(WorkflowResponseSchema, "/api/workflows/default"),
  getWorkflow: (id: string) => call(WorkflowResponseSchema, `/api/workflows/${encodeURIComponent(id)}`),
  listWorkflows: () => call(WorkflowListResponseSchema, "/api/workflows"),
  createFromTemplate: (templateId: string) =>
    call(WorkflowResponseSchema, `/api/workflows/from-template/${encodeURIComponent(templateId)}`, { method: "POST", body: "{}" }),
  saveWorkflow: (id: string, body: SaveWorkflowBody) =>
    call(WorkflowResponseSchema, `/api/workflows/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  startRun: (workflowId: string) =>
    call(StartRunResponseSchema, `/api/workflows/${encodeURIComponent(workflowId)}/runs`, { method: "POST", body: "{}" }),
  getRun: (runId: string) => call(RunResponseSchema, `/api/runs/${encodeURIComponent(runId)}`),
  getMuseAccounts: () => call(MuseAccountsResponseSchema, "/api/muse/accounts"),
  listAssets: (kind: AssetKind) => call(AssetListResponseSchema, `/api/assets?kind=${encodeURIComponent(kind)}`),
};
