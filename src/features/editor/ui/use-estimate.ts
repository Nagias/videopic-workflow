import { useEffect, useRef, useState } from "react";
import { api } from "../../../app/api-client";
import type { EstimateResponse } from "../../../shared/api";
import { errText, type SaveState } from "./use-workflow";

// Chờ ngần này sau mỗi lần "Đã lưu" rồi mới ước tính: gõ liên tục thì chỉ ước tính một lần khi dừng tay.
export const ESTIMATE_DELAY_MS = 1000;

export type EstimateView = {
  // Ước tính (cả workflow) của bản ĐÃ LƯU gần nhất; null khi chưa có, đang tính lại cho workflow vừa mở, hoặc ước tính lỗi.
  estimate: EstimateResponse | null;
  // Lời báo lỗi của lần ước tính gần nhất (đồ thị không dùng được...). Không nuốt: ô "Lần chạy tới" hiện nó.
  error: string | null;
};

// Ước tính lượt của cả workflow cho ô "Lần chạy tới" và dòng kiểm luật trên khung nhóm. API chỉ đọc bản đã lưu, nên chỉ tính khi
// đã lưu xong (saved) hoặc vừa mở workflow (idle), 1 giây sau lần lưu cuối; mỗi lần lưu mới huỷ lần chờ trước. `enabled` = false
// khi đang chạy / đang kiểm trước khi chạy: không tính; bật lại (chạy xong) thì tính lại. Kết quả của yêu cầu cũ (đã có yêu cầu
// mới hơn, hoặc đã đổi workflow) bị bỏ, không ghi đè kết quả mới.
export function useEstimate(workflowId: string | null, saveState: SaveState, enabled: boolean): EstimateView {
  const [view, setView] = useState<EstimateView & { forWorkflow: string | null }>({ estimate: null, error: null, forWorkflow: null });
  const latestRequest = useRef(0);

  useEffect(() => {
    if (!workflowId || !enabled || (saveState !== "saved" && saveState !== "idle")) return;
    const request = ++latestRequest.current;
    const timer = setTimeout(() => {
      api.estimate(workflowId).then(
        (estimate) => {
          if (latestRequest.current === request) setView({ estimate, error: null, forWorkflow: workflowId });
        },
        (e: unknown) => {
          if (latestRequest.current === request) setView({ estimate: null, error: errText(e), forWorkflow: workflowId });
        },
      );
    }, ESTIMATE_DELAY_MS);
    return () => {
      clearTimeout(timer);
      // Yêu cầu đã gửi đi mà chưa về cũng thành cũ.
      latestRequest.current++;
    };
  }, [workflowId, saveState, enabled]);

  // Kết quả của workflow khác (vừa chuyển): không hiện.
  return view.forWorkflow === workflowId ? { estimate: view.estimate, error: view.error } : { estimate: null, error: null };
}
