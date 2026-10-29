import type { RunNodeState } from "../../../shared/api";
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
