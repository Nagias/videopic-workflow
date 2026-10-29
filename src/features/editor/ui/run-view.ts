import type { RunResponse } from "../../../shared/api";

export const RUN_LABEL: Record<RunResponse["status"], string> = {
  queued: "Đang xếp hàng…",
  running: "Đang chạy…",
  succeeded: "Chạy xong",
  failed: "Lỗi",
};

export const isActive = (r: RunResponse | null) => r !== null && (r.status === "queued" || r.status === "running");

export type RunView = {
  active: boolean;
  // Lần chạy đang hiện là lần cũ tải lại lúc mở workflow và không còn chạy.
  fromHistory: boolean;
  // Hộp hỏi Thay/Giữ chỉ cho lần chạy xem trực tiếp trong phiên này và đã dừng hẳn: lần chạy cũ tải lại có thể đã được
  // trả lời, còn lần đang chạy thì máy chủ chưa xong việc (chưa được gọi tạo lại thẻ cảnh).
  pendingDecision: NonNullable<RunResponse["decision"]> | null;
  runLabel: string;
  runError: string | null;
};

// Các giá trị hiển thị suy ra từ lần chạy đang hiện (nhãn trạng thái, lỗi, hộp hỏi Thay/Giữ).
export function runView(run: RunResponse | null, runFromHistory: boolean): RunView {
  const active = isActive(run);
  const fromHistory = runFromHistory && !active;
  const pendingDecision = run?.decision?.kind === "scenes-edited" && !runFromHistory && !active ? run.decision : null;
  const runLabel = run ? (fromHistory ? `Lần trước: ${RUN_LABEL[run.status]}` : RUN_LABEL[run.status]) : "";
  // Lần chạy cũ dừng để hỏi Thay/Giữ: hộp hỏi chỉ hiện cho lần chạy xem trong phiên (lần cũ có thể đã được trả lời),
  // nên chỉ dặn bấm Chạy — Biên kịch vẫn ra bộ cảnh khác thì lần chạy mới sẽ hỏi lại.
  const runError = !run?.error
    ? null
    : fromHistory && run.decision?.kind === "scenes-edited"
      ? "Lần chạy trước dừng vì Biên kịch ra bộ cảnh mới mà thẻ cảnh đã được sửa tay. Bấm ▶ Chạy để chọn Thay hoặc Giữ."
      : fromHistory
        ? `Lần chạy trước lỗi: ${run.error}`
        : run.error;
  return { active, fromHistory, pendingDecision, runLabel, runError };
}
