import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { EstimateResponse, RunScope } from "../../../shared/api";
import { estimateText, isFirmEstimate, rowText } from "./estimate-view";

// Bấm "▶ Chạy" chậm ngần này sau khi hộp hiện: cú bấm đúp vào nút Chạy ở thanh trên (hoặc phím Enter giữ lâu) không rơi vào
// nút "▶ Chạy" của hộp khi nó vừa hiện ra ngay dưới con trỏ.
const ARM_DELAY_MS = 400;

const TITLE: Record<RunScope["mode"], string> = {
  all: "Chạy cả workflow?",
  node: "Chạy node này?",
  downstream: "Chạy từ node này trở đi?",
};

type Props = {
  scope: RunScope;
  estimate: EstimateResponse;
  onOk: () => void;
  onCancel: () => void;
};

// Hộp xác nhận trước khi chạy (spec 6.5): ghi số lượt Muse sẽ tốn, từng node "dùng lại" / "sẽ gọi Muse" / "chưa biết".
// An toàn mặc định: tiêu điểm nằm ở "Huỷ" (Enter một mình không tốn lượt), Escape và bấm ra ngoài là Huỷ, Tab chỉ xoay giữa hai nút.
export function RunConfirm({ scope, estimate, onOk, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const okRef = useRef<HTMLButtonElement | null>(null);
  const [armed, setArmed] = useState(false);
  // Câu "không thấp hơn thực tế" chỉ đúng khi mọi node đều ước được: còn node chưa biết hay Biên kịch sắp viết lại thì không hứa.
  const exact = isFirmEstimate(estimate);

  useEffect(() => {
    cancelRef.current?.focus();
    const t = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Tab xoay giữa "Huỷ" và "▶ Chạy" (đừng để tiêu điểm lọt ra canvas phía sau lớp phủ).
  const onDialogKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const order = [cancelRef.current, okRef.current].filter((b): b is HTMLButtonElement => b !== null && !b.disabled);
    if (order.length === 0) return;
    const at = order.indexOf(document.activeElement as HTMLButtonElement);
    order[(at + (e.shiftKey ? -1 : 1) + order.length) % order.length]!.focus();
  };

  return (
    <div
      className="confirm-overlay"
      onMouseDown={(e) => {
        // Chưa "lên nòng" (0,4 giây đầu): cú nhấp thứ hai của một cú bấm đúp chậm rơi vào lớp phủ vừa hiện thì không được huỷ hộp.
        if (armed && e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="confirm" data-testid="run-confirm" role="dialog" aria-modal="true" aria-label={TITLE[scope.mode]} onKeyDown={onDialogKey}>
        <h2>{TITLE[scope.mode]}</h2>
        <p className="confirm-total" data-testid="run-confirm-total">
          Lần chạy này tốn: <b>{estimateText(estimate)}</b>
        </p>
        <ul className="confirm-rows">
          {estimate.nodes.map((n) => (
            <li key={n.id} className={`row-${n.status}`} data-testid={`run-confirm-row-${n.id}`}>
              <span className="row-label">{n.label}</span>
              <span className="row-what">{rowText(n)}</span>
            </li>
          ))}
        </ul>
        {exact ? (
          <p className="confirm-note" data-testid="run-confirm-note">
            Ước tính không bao giờ thấp hơn thực tế: bước con đã có sẵn kết quả thì lúc chạy không gọi lại.
          </p>
        ) : null}
        <div className="confirm-actions">
          <button type="button" ref={cancelRef} data-testid="run-confirm-cancel" onClick={onCancel}>
            Huỷ
          </button>
          <button type="button" ref={okRef} className="primary" data-testid="run-confirm-ok" disabled={!armed} onClick={onOk}>
            ▶ Chạy
          </button>
        </div>
      </div>
    </div>
  );
}
