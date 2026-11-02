import type { RunNodeState } from "../../../shared/api";

export type QueueSummary = {
  // Node đã xong (chạy xong hoặc dùng lại kết quả) trên tổng số node của lần chạy.
  done: number;
  total: number;
  failed: number;
  // Mã các node đang chạy, theo thứ tự của `ids`.
  running: string[];
};

// Tóm tắt hàng chờ từ trạng thái node. `ids` là các node THUỘC lần chạy này: trạng thái node ngoài phạm vi vẫn nằm trong `states`
// (giữ kết quả lần trước) nên không được đếm.
export function queueSummary(states: Record<string, RunNodeState>, ids: readonly string[]): QueueSummary {
  let done = 0;
  let failed = 0;
  const running: string[] = [];
  for (const id of ids) {
    const status = states[id]?.status;
    if (status === "succeeded" || status === "cached") done++;
    else if (status === "failed") failed++;
    else if (status === "running") running.push(id);
  }
  return { done, total: ids.length, failed, running };
}
