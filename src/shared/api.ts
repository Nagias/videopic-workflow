import { z } from "zod";
import { ASSET_KINDS } from "./node-definition";
import { NodeOutputsSchema } from "./ports";
import { WorkflowGraphSchema } from "./workflow";

export const WorkflowResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  graph: WorkflowGraphSchema,
  updatedAt: z.number(),
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
export type SaveWorkflowBody = z.infer<typeof SaveWorkflowBodySchema>;

export const StartRunResponseSchema = z.object({ runId: z.string() });

export const NODE_STATUSES = ["pending", "running", "succeeded", "cached", "failed", "skipped"] as const;
export const RUN_STATUSES = ["queued", "running", "succeeded", "failed"] as const;

export const RunNodeStateSchema = z.object({
  status: z.enum(NODE_STATUSES),
  message: z.string().nullable(),
  error: z.string().nullable(),
  output: NodeOutputsSchema.nullable(),
});
export type RunNodeState = z.infer<typeof RunNodeStateSchema>;

export const RunResponseSchema = z.object({
  id: z.string(),
  status: z.enum(RUN_STATUSES),
  error: z.string().nullable(),
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
