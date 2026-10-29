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
  SaveConflictSchema,
  StartRunResponseSchema,
  WorkflowListResponseSchema,
  WorkflowResponseSchema,
  type ExpandScenesBody,
  type RunRequestBody,
  type RunScope,
  type SaveWorkflowBody,
  type WorkflowResponse,
} from "../shared/api";

// Máy chủ từ chối: lời báo tiếng Việt của máy chủ (hoặc mã lỗi), kèm mã trạng thái và thân trả về.
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Lưu workflow bị từ chối vì máy chủ đang giữ bản mới hơn (409): kèm bản đó để giao diện hiện lại.
export class WorkflowConflictError extends Error {
  constructor(
    message: string,
    readonly workflow: WorkflowResponse,
  ) {
    super(message);
    this.name = "WorkflowConflictError";
  }
}

async function call<S extends z.ZodType>(schema: S, url: string, init?: RequestInit): Promise<z.infer<S>> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ApiErrorSchema.safeParse(body);
    throw new ApiError(err.success ? err.data.error : `Máy chủ trả lỗi ${res.status}`, res.status, body);
  }
  return schema.parse(body);
}

export const ESTIMATE_TIMEOUT_MS = 20_000;
export const ESTIMATE_TIMEOUT_MESSAGE = "Ước tính quá lâu, thử lại";

const runBody = (scope?: RunScope): RunRequestBody => (scope ? { scope } : {});

export const api = {
  getDefaultWorkflow: () => call(WorkflowResponseSchema, "/api/workflows/default"),
  getWorkflow: (id: string) => call(WorkflowResponseSchema, `/api/workflows/${encodeURIComponent(id)}`),
  listWorkflows: () => call(WorkflowListResponseSchema, "/api/workflows"),
  createFromTemplate: (templateId: string) =>
    call(WorkflowResponseSchema, `/api/workflows/from-template/${encodeURIComponent(templateId)}`, { method: "POST", body: "{}" }),
  // body.baseUpdatedAt = updatedAt của bản đã tải/lưu gần nhất; máy chủ giữ bản khác thì ném WorkflowConflictError (không ghi gì).
  saveWorkflow: async (id: string, body: SaveWorkflowBody): Promise<WorkflowResponse> => {
    try {
      return await call(WorkflowResponseSchema, `/api/workflows/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
    } catch (e) {
      const conflict = e instanceof ApiError && e.status === 409 ? SaveConflictSchema.safeParse(e.data) : undefined;
      if (conflict?.success) throw new WorkflowConflictError(conflict.data.error, conflict.data.workflow);
      throw e;
    }
  },
  // Không truyền scope: chạy cả workflow.
  startRun: (workflowId: string, scope?: RunScope) =>
    call(StartRunResponseSchema, `/api/workflows/${encodeURIComponent(workflowId)}/runs`, { method: "POST", body: JSON.stringify(runBody(scope)) }),
  // Quá hạn (timeoutMs) thì huỷ yêu cầu và báo lỗi: giao diện bị khoá trong lúc ước tính nên không được chờ mãi.
  estimate: async (workflowId: string, scope?: RunScope, timeoutMs = ESTIMATE_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await call(EstimateResponseSchema, `/api/workflows/${encodeURIComponent(workflowId)}/estimate`, {
        method: "POST",
        body: JSON.stringify(runBody(scope)),
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted) throw new Error(ESTIMATE_TIMEOUT_MESSAGE, { cause: e });
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },
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
