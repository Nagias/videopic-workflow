import { WorkflowConflictError } from "../../../app/api-client";

// Lần lưu xếp hàng bị bỏ vì canvas đã được thay bằng đồ thị máy chủ trong lúc chờ (xem useWorkflow.save).
export class GraphReplacedError extends Error {
  constructor() {
    super("Đồ thị trên màn hình vừa được thay bằng bản mới từ máy chủ — hãy xem lại rồi thử lại");
    this.name = "GraphReplacedError";
  }
}

// Lỗi lưu này nghĩa là canvas đã được thay bằng đồ thị máy chủ (lời báo đã hiện ở thanh báo hoặc là chính việc thay đồ thị):
// dữ liệu an toàn, không phải "lưu hỏng" nên không báo thêm lỗi nào đè lên.
export const graphWasReplaced = (e: unknown): boolean => e instanceof WorkflowConflictError || e instanceof GraphReplacedError;

export type ReloadOutcome<L> = { kind: "applied"; last: L } | { kind: "stale" } | { kind: "busy" };

export type ReloadDeps<W, L> = {
  tries: number;
  // Lưu sửa đổi đang chờ (hoặc chờ lần lưu đang gửi).
  flush(): Promise<void>;
  // Tải đồ thị máy chủ (và kết quả lần chạy gần nhất nếu cần).
  load(): Promise<{ wf: W; last: L }>;
  // Workflow này vẫn đang mở.
  isShown(): boolean;
  // Còn sửa đổi chưa lưu hoặc lần lưu đang gửi.
  isBusy(): boolean;
  apply(wf: W): void;
};

// Tải lại đồ thị máy chủ lên canvas mà không đè sửa đổi của người dùng: lưu trước, tải, và nếu trong lúc tải lại có sửa thêm thì
// lưu rồi tải lại (tối đa `tries` lần). Lưu bị máy chủ từ chối 409 (đồ thị máy chủ đã hiện lên canvas) thì tiếp tục tải:
// đúng là điều đang cần làm, nên không phải lỗi. Lỗi khác ném tiếp.
export async function reloadFromServer<W, L>(d: ReloadDeps<W, L>): Promise<ReloadOutcome<L>> {
  for (let i = 0; i < d.tries; i++) {
    try {
      await d.flush();
    } catch (e) {
      if (!graphWasReplaced(e)) throw e;
    }
    const { wf, last } = await d.load();
    if (!d.isShown()) return { kind: "stale" };
    if (d.isBusy()) continue;
    d.apply(wf);
    return { kind: "applied", last };
  }
  return { kind: "busy" };
}
