import type { RunApi } from "./use-run";
import type { WorkflowApi } from "./use-workflow";

type Props = {
  wf: WorkflowApi;
  run: RunApi;
};

// Các dải báo dưới thanh trên: lời báo của máy chủ, hộp hỏi Thay/Giữ, hướng dẫn sau khi chọn, lỗi.
export function Banners({ wf, run }: Props) {
  const { notice, setNotice, problem, setProblem } = wf;
  return (
    <>
      {notice ? (
        <div className="banner notice" data-testid="workflow-notice">
          {notice}
          <button type="button" onClick={() => setNotice(null)}>
            Đóng
          </button>
        </div>
      ) : null}
      {run.pendingDecision ? (
        <div className="banner decision" data-testid="scenes-decision">
          <span>
            Biên kịch vừa viết bộ cảnh mới, nhưng các thẻ cảnh của nó đã được sửa tay. <strong>Thay</strong>: dùng bộ cảnh mới (mất phần sửa tay).{" "}
            <strong>Giữ</strong>: giữ thẻ cảnh đang có. Chọn xong bấm ▶ Chạy lại.
          </span>
          <div className="banner-actions">
            <button type="button" data-testid="scenes-replace" disabled={run.syncing} onClick={() => void run.decide("replace")}>
              Thay
            </button>
            <button type="button" data-testid="scenes-keep" disabled={run.syncing} onClick={() => void run.decide("keep")}>
              Giữ
            </button>
          </div>
        </div>
      ) : null}
      {run.info ? (
        <div className="banner decision">
          {run.info}
          <button type="button" onClick={() => run.setInfo(null)}>
            Đóng
          </button>
        </div>
      ) : null}
      {problem || run.runError ? (
        <div className="banner" data-testid="problem-banner">
          {problem ?? run.runError}
          <button type="button" onClick={() => setProblem(null)}>
            Đóng
          </button>
        </div>
      ) : null}
    </>
  );
}
