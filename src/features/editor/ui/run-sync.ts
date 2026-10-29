import type { RunNodeState } from "../../../shared/api";
import { stableStringify } from "../../../shared/hash";
import type { WorkflowGroup } from "../../../shared/workflow";

// Biên kịch có nhóm thẻ cảnh trên canvas và đã xong (chạy hoặc dùng lại kết quả) trong lần chạy đang theo dõi, mà chưa tải lại
// đồ thị cho nó: máy chủ có thể vừa tạo lại nhóm (regroup ghi db ngay khi Biên kịch xong), canvas phải tải lại ngay giữa
// lần chạy để lần tự lưu sau không gửi nhóm cũ đè lên. `runNodes` là trạng thái node của riêng lần chạy này (chưa gộp
// với kết quả lần trước, kẻo Biên kịch "xong" từ lần trước bị tính).
export function writersFinished(groups: readonly WorkflowGroup[], runNodes: Record<string, RunNodeState>, seen: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const g of groups) {
    const writerId = g.source?.writerId;
    if (writerId === undefined || seen.has(writerId) || out.includes(writerId)) continue;
    const status = runNodes[writerId]?.status;
    if (status === "succeeded" || status === "cached") out.push(writerId);
  }
  return out;
}

// Tham số từng node (dạng chữ, khoá xếp cố định) ở một thời điểm: để so với đồ thị máy chủ trả về sau khi đổi thẻ cảnh.
export function paramsSnapshot(nodes: readonly { id: string; params: unknown }[]): ReadonlyMap<string, string> {
  return new Map(nodes.map((n) => [n.id, stableStringify(n.params)]));
}

// Node mà kết quả đang hiện không còn đúng với tham số mới: tham số khác bản `before`, hoặc mã node chưa có trong `before`
// (thẻ mới, kể cả mã dùng lại của thẻ đã bị bỏ: kết quả còn giữ theo mã đó là của thẻ cũ). Node giữ nguyên tham số thì kết quả
// vẫn đúng (cache dùng lại), không đụng tới.
export function staleResultIds(before: ReadonlyMap<string, string>, after: readonly { id: string; params: unknown }[]): string[] {
  return after.filter((n) => before.get(n.id) !== stableStringify(n.params)).map((n) => n.id);
}

// Kết quả đang hiện sau khi bỏ kết quả của các node `ids` (các node đó hiện "Chưa chạy" tới lần chạy sau). Không có gì để bỏ thì
// trả đúng đối tượng cũ (không vẽ lại).
export function withoutResults(states: Record<string, RunNodeState>, ids: readonly string[]): Record<string, RunNodeState> {
  const drop = ids.filter((id) => id in states);
  if (drop.length === 0) return states;
  const next = { ...states };
  for (const id of drop) delete next[id];
  return next;
}
