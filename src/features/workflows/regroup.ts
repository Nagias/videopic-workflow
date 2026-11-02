import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../core/db/client";
import { runs } from "../../core/db/schema";
import type { WorkflowResponse } from "../../shared/api";
import { restoreSceneGroups } from "../../shared/restore-groups";
import { WorkflowGraphSchema, type WorkflowGroup } from "../../shared/workflow";
import { saveWorkflowGraph, toWorkflowResponse } from "./store";
import { BACKUP_SUFFIX, UPGRADE_FAILED_NOTICE } from "./upgrade";

export const groupsRestoredNotice = (scenes: number, unreadableRuns: number): string =>
  `Đã khôi phục nhóm Phân cảnh (${scenes} cảnh) bị mất ở một lần lưu trước — kết quả cũ giữ nguyên, không tốn lượt Muse.` +
  (unreadableRuns > 0 ? ` (${unreadableRuns} lần chạy cũ không đọc được; nhóm nào không tìm lại được thì tạo mới, không gắn Biên kịch.)` : "");

// Mở workflow (sau bước chuyển workflow cũ): Ghép phim có cảnh cắm vào mà không cảnh nào thuộc nhóm thì khôi phục nhóm Phân cảnh
// (restoreSceneGroups: lấy lại y nguyên nhóm trong đồ thị lần chạy gần nhất nếu có, không thì tạo nhóm mới khi mã node cho thấy
// đó từng là một nhóm) và lưu, kèm lời báo. Không đụng: bản sao lưu "-ban-cu", workflow vừa chuyển lỗi (lời báo đã nói "chưa bị đổi"),
// workflow đang có lần chạy xếp hàng/đang chạy (lần đó đang ghi đồ thị), workflow không thiếu nhóm.
export function restoreGroupsOnOpen(db: Db, res: WorkflowResponse, logWarn: (msg: string, runId: string) => void): WorkflowResponse {
  if (res.id.endsWith(BACKUP_SUFFIX) || res.notice?.startsWith(UPGRADE_FAILED_NOTICE)) return res;
  // Không còn Ghép phim nào mà cảnh chưa có nhóm thì không đọc lần chạy cũ (đường thường của mọi lần mở).
  if (!hasUngroupedCombine(res)) return res;
  const pending = db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.workflowId, res.id), inArray(runs.status, ["queued", "running"])))
    .limit(1)
    .get();
  if (pending) return res;

  const previous: WorkflowGroup[][] = [];
  let unreadable = 0;
  for (const run of db.select({ id: runs.id, graphJson: runs.graphJson }).from(runs).where(eq(runs.workflowId, res.id)).orderBy(desc(runs.createdAt)).all()) {
    const parsed = parseGraph(run.graphJson);
    if (parsed.ok) previous.push(parsed.groups);
    else {
      unreadable++;
      logWarn(`Không đọc được đồ thị của lần chạy khi tìm nhóm cũ: ${parsed.error}`, run.id);
    }
  }

  const { graph, restored } = restoreSceneGroups(res.graph, previous);
  if (restored.length === 0) return res;
  const saved = saveWorkflowGraph(db, res.id, graph);
  const notice = groupsRestoredNotice(
    restored.reduce((n, g) => n + g.nodeIds.length, 0),
    unreadable,
  );
  return { ...toWorkflowResponse(saved), notice: res.notice ? `${res.notice} ${notice}` : notice };
}

// Còn Ghép phim có cảnh cắm vào mà không cảnh nào thuộc nhóm (ứng viên cần tra lần chạy cũ).
function hasUngroupedCombine(res: WorkflowResponse): boolean {
  const grouped = new Set(res.graph.groups.flatMap((g) => g.nodeIds));
  const types = new Map(res.graph.nodes.map((n) => [n.id, n.type]));
  return res.graph.nodes.some((c) => {
    if (c.type !== "film-combine") return false;
    const scenes = res.graph.edges.filter((e) => e.target === c.id && e.targetHandle === "clips" && types.get(e.source) === "scene");
    return scenes.length > 0 && scenes.every((e) => !grouped.has(e.source));
  });
}

function parseGraph(text: string): { ok: true; groups: WorkflowGroup[] } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const parsed = WorkflowGraphSchema.safeParse(json);
  return parsed.success ? { ok: true, groups: parsed.data.groups } : { ok: false, error: parsed.error.message };
}
