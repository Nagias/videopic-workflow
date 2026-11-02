import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../core/db/client";
import { runs } from "../../core/db/schema";
import type { WorkflowResponse } from "../../shared/api";
import { restoreSceneGroups } from "../../shared/restore-groups";
import { WorkflowGraphSchema, type WorkflowGroup } from "../../shared/workflow";
import { saveWorkflowGraph, toWorkflowResponse } from "./store";
import { BACKUP_SUFFIX } from "./upgrade";

export const groupsRestoredNotice = (scenes: number): string =>
  `Đã khôi phục nhóm Phân cảnh (${scenes} cảnh) bị mất ở một lần lưu trước — kết quả cũ giữ nguyên, không tốn lượt Muse.`;

// Mở workflow (sau bước chuyển workflow cũ): Ghép phim có cảnh cắm vào mà không cảnh nào thuộc nhóm thì khôi phục nhóm Phân cảnh
// (restoreSceneGroups: lấy lại y nguyên nhóm trong đồ thị lần chạy gần nhất nếu có, không thì tạo nhóm mới) và lưu, kèm lời báo.
// Không đụng: bản sao lưu "-ban-cu", workflow đang có lần chạy xếp hàng/đang chạy (lần đó đang ghi đồ thị), workflow không thiếu nhóm.
export function restoreGroupsOnOpen(db: Db, res: WorkflowResponse, logWarn: (msg: string, runId: string) => void): WorkflowResponse {
  if (res.id.endsWith(BACKUP_SUFFIX) || restoreSceneGroups(res.graph, []).restored.length === 0) return res;
  const pending = db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.workflowId, res.id), inArray(runs.status, ["queued", "running"])))
    .limit(1)
    .get();
  if (pending) return res;

  const previous: WorkflowGroup[][] = [];
  for (const run of db.select({ id: runs.id, graphJson: runs.graphJson }).from(runs).where(eq(runs.workflowId, res.id)).orderBy(desc(runs.createdAt)).all()) {
    const parsed = WorkflowGraphSchema.safeParse(safeJson(run.graphJson));
    if (parsed.success) previous.push(parsed.data.groups);
    else logWarn("Không đọc được đồ thị của lần chạy khi tìm nhóm cũ", run.id);
  }

  const { graph, restored } = restoreSceneGroups(res.graph, previous);
  const saved = saveWorkflowGraph(db, res.id, graph);
  const notice = groupsRestoredNotice(restored.reduce((n, g) => n + g.nodeIds.length, 0));
  return { ...toWorkflowResponse(saved), notice: res.notice ? `${res.notice} ${notice}` : notice };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
