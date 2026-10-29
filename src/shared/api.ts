import { z } from "zod";
import { ASSET_KINDS } from "./node-definition";
import { NodeOutputsSchema } from "./ports";
import { WorkflowGraphSchema } from "./workflow";

export const WorkflowResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  graph: WorkflowGraphSchema,
  updatedAt: z.number(),
  // Mở workflow cũ mà chuyển sang Cảnh/Ghép phim bị lỗi: workflow trả về nguyên như cũ, đây là lời báo kèm lỗi.
  notice: z.string().optional(),
});
export type WorkflowResponse = z.infer<typeof WorkflowResponseSchema>;

export const WorkflowListResponseSchema = z.object({
  workflows: z.array(z.object({ id: z.string(), name: z.string(), updatedAt: z.number() })),
});
export type WorkflowListResponse = z.infer<typeof WorkflowListResponseSchema>;

export const SaveWorkflowBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  graph: WorkflowGraphSchema,
});
// Thân gửi lên (kiểu đầu vào của schema): `graph.groups` được bỏ, máy chủ hiểu là không có nhóm.
export type SaveWorkflowBody = z.input<typeof SaveWorkflowBodySchema>;

export const StartRunResponseSchema = z.object({ runId: z.string() });

// Tạo thẻ cảnh từ kết quả Biên kịch mới nhất. "replace" (mặc định): tạo/thay nhóm; "keep": giữ thẻ đang có.
export const ExpandScenesBodySchema = z.object({
  writerId: z.string().min(1, "Thiếu mã node Biên kịch"),
  choice: z.enum(["replace", "keep"]).optional(),
});
export type ExpandScenesBody = z.infer<typeof ExpandScenesBodySchema>;

export const NODE_STATUSES = ["pending", "running", "succeeded", "cached", "failed", "skipped"] as const;
export const RUN_STATUSES = ["queued", "running", "succeeded", "failed"] as const;

export const RunNodeStateSchema = z.object({
  status: z.enum(NODE_STATUSES),
  message: z.string().nullable(),
  error: z.string().nullable(),
  output: NodeOutputsSchema.nullable(),
});
export type RunNodeState = z.infer<typeof RunNodeStateSchema>;

// Lần chạy dừng lại để hỏi chủ dự án (runs.decision_json). Hiện có một loại: Biên kịch ra bộ cảnh mới
// nhưng nhóm Phân cảnh của nó đã bị sửa tay → chọn Thay hay Giữ (POST /api/workflows/:id/scenes).
export const RunDecisionSchema = z.object({ kind: z.literal("scenes-edited"), writerId: z.string(), groupId: z.string() });
export type RunDecision = z.infer<typeof RunDecisionSchema>;

export const RunResponseSchema = z.object({
  id: z.string(),
  status: z.enum(RUN_STATUSES),
  error: z.string().nullable(),
  decision: RunDecisionSchema.nullable(),
  nodes: z.record(z.string(), RunNodeStateSchema),
});
export type RunResponse = z.infer<typeof RunResponseSchema>;

export const LatestRunResponseSchema = z.object({ run: RunResponseSchema.nullable() });
export type LatestRunResponse = z.infer<typeof LatestRunResponseSchema>;

export const MuseAccountsResponseSchema = z.object({
  accounts: z.array(z.object({ id: z.string(), state: z.enum(["ready", "busy", "needs_login", "cooldown"]), loggedIn: z.boolean() })),
});
export type MuseAccountsResponse = z.infer<typeof MuseAccountsResponseSchema>;

export const AssetSummarySchema = z.object({
  id: z.string(),
  kind: z.enum(ASSET_KINDS),
  name: z.string(),
  params: z.record(z.string(), z.unknown()),
  thumbnailMediaId: z.string().nullable(),
  updatedAt: z.number(),
});
export type AssetSummary = z.infer<typeof AssetSummarySchema>;
export const AssetListResponseSchema = z.object({ assets: z.array(AssetSummarySchema) });
export type AssetListResponse = z.infer<typeof AssetListResponseSchema>;

export const ApiErrorSchema = z.object({ error: z.string() });

export const mediaUrl = (mediaId: string) => `/api/media/${encodeURIComponent(mediaId)}`;
