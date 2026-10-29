import { RUN_LABEL } from "./run-view";
import { queueSummary } from "./queue-view";
import type { RunView } from "./use-run";

type Props = {
  run: RunView;
  // Tên hiện trên thẻ của node (Cảnh 3, Nhân vật...).
  titleOf: (nodeId: string) => string;
  // Khung bên phải đang mở vì có node được chọn: khi rảnh cũng hiện thêm dòng "Lần chạy trước". Khi đang chạy thì luôn hiện.
  inspectorOpen: boolean;
};

// Hàng chờ của lần chạy: đang chạy thì liệt kê node `running` kèm bước đang làm và hồ sơ Muse (máy chủ ghi trong `message`), số node
// xong / tổng, nút Huỷ. Rảnh thì chỉ ghi kết quả lần trước, và chỉ khi khung bên phải đã mở (không tự mở khung chỉ để ghi dòng này).
export function QueuePanel({ run, titleOf, inspectorOpen }: Props) {
  const { run: current, nodeStates, runNodeIds } = run;
  if (run.active && current) {
    const summary = queueSummary(nodeStates, runNodeIds);
    const queued = current.status === "queued";
    return (
      <section className="queue-panel active" data-testid="queue-panel" aria-label="Hàng chờ">
        <div className="qh">
          <b>Hàng chờ</b>
          <span data-testid="queue-progress">{queued ? "đang xếp hàng" : `${summary.done}/${summary.total} node xong${summary.failed > 0 ? ` · ${summary.failed} lỗi` : ""}`}</span>
          <button type="button" data-testid="cancel-run" disabled={run.cancelling} onClick={() => void run.cancel()}>
            {run.cancelling ? "Đang huỷ…" : "Huỷ"}
          </button>
        </div>
        <ul className="qlist">
          {queued ? <li data-testid="queue-waiting">Đang xếp hàng, chờ đến lượt…</li> : null}
          {summary.running.map((id) => (
            <li key={id} data-testid={`queue-row-${id}`}>
              <b>{titleOf(id)}</b>
              <span>{nodeStates[id]?.message ?? "Đang chạy…"}</span>
            </li>
          ))}
          {!queued && summary.running.length === 0 ? <li className="muted">Chưa node nào đang chạy…</li> : null}
        </ul>
      </section>
    );
  }
  if (!inspectorOpen || !current) return null;
  return (
    <section className="queue-panel" data-testid="queue-panel" aria-label="Hàng chờ">
      <div className="qh">
        <b>Hàng chờ</b>
        <span data-testid="queue-progress">rảnh</span>
      </div>
      <div className="qlast" data-testid="queue-last">
        Lần chạy trước: <b className={`run-${current.status}`}>{RUN_LABEL[current.status]}</b>
        {current.error ? ` — ${current.error}` : ""}
      </div>
    </section>
  );
}
