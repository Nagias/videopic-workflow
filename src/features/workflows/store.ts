import { eq } from "drizzle-orm";
import type { Db } from "../../core/db/client";
import { workflows } from "../../core/db/schema";
import type { WorkflowResponse } from "../../shared/api";
import { WorkflowGraphSchema, type WorkflowGraph } from "../../shared/workflow";

// Nơi DUY NHẤT ghi bảng `workflows` (CLAUDE.md mục 4): API lưu/tạo workflow và bộ máy chạy (tạo lại nhóm Phân cảnh) đều qua đây.

export type WorkflowRow = typeof workflows.$inferSelect;

export function getWorkflowRow(db: Db, id: string): WorkflowRow | undefined {
  return db.select().from(workflows).where(eq(workflows.id, id)).get();
}

export function toWorkflowResponse(row: WorkflowRow): WorkflowResponse {
  return { id: row.id, name: row.name, graph: WorkflowGraphSchema.parse(JSON.parse(row.graphJson)), updatedAt: row.updatedAt };
}

// Lưu đồ thị (tạo mới nếu chưa có). Tên: tên truyền vào, không thì giữ tên cũ, chưa có thì "Workflow".
// updatedAt là "phiên bản" để PUT so (baseUpdatedAt): mỗi lần ghi phải lớn hơn lần trước, kể cả hai lần ghi trong cùng một
// mili giây (Date.now() trùng), nếu không bản cũ có thể lọt qua phép so.
export function saveWorkflowGraph(db: Db, id: string, graph: WorkflowGraph, name?: string): WorkflowRow {
  const existing = getWorkflowRow(db, id);
  const row: WorkflowRow = {
    id,
    name: name ?? existing?.name ?? "Workflow",
    graphJson: JSON.stringify(WorkflowGraphSchema.parse(graph)),
    updatedAt: existing ? Math.max(Date.now(), existing.updatedAt + 1) : Date.now(),
  };
  db.insert(workflows).values(row).onConflictDoUpdate({ target: workflows.id, set: row }).run();
  return row;
}
