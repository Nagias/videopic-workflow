import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  graphJson: text("graph_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id").notNull(),
    graphJson: text("graph_json").notNull(),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed"] }).notNull(),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
  },
  (t) => [index("runs_status_idx").on(t.status, t.createdAt)],
);

export const runNodes = sqliteTable(
  "run_nodes",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status", { enum: ["pending", "running", "succeeded", "cached", "failed", "skipped"] }).notNull(),
    cacheKey: text("cache_key"),
    outputJson: text("output_json"),
    message: text("message"),
    error: text("error"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.nodeId] })],
);

export const nodeCache = sqliteTable("node_cache", {
  cacheKey: text("cache_key").primaryKey(),
  outputJson: text("output_json").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const media = sqliteTable("media", {
  id: text("id").primaryKey(),
  sha256: text("sha256").notNull().unique(),
  kind: text("kind", { enum: ["video", "image"] }).notNull(),
  relPath: text("rel_path").notNull(),
  width: integer("width"),
  height: integer("height"),
  durationSec: real("duration_sec"),
  source: text("source").notNull(),
  createdAt: integer("created_at").notNull(),
});
