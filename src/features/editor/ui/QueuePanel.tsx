import { RUN_LABEL } from "./run-view";
import { queueSummary } from "./queue-view";
import type { RunPanelApi } from "./use-run";

type Props = {
  run: RunPanelApi;
  // Tên hiện trên thẻ của node (Cảnh 3, Nhân vật...).
  titleOf: (nodeId: string) => string;
  // "panel": ô trong khung bên phải (khi đang chạy). "floating": một dòng nhỏ nổi ở góc dưới trái canvas (khi rảnh), không đẩy
  // khung bên phải và không mở khung đó chỉ để ghi một dòng.
  variant: "panel" | "floating";
};

// Hàng chờ của lần chạy: đang chạy thì liệt kê node `running` kèm bước đang làm và hồ sơ Muse (máy chủ ghi trong `message`), số node
// xong / tổng, nút Huỷ. Rảnh thì ghi kết quả lần chạy trước (khi đã có lần chạy nào).
export function QueuePanel({ run, titleOf, variant }: Props) {
  const { run: current, nodeStates, runNodeIds } = run;
  if (run.active && current) {
    if (variant !== "panel") return null;
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
  if (variant !== "floating" || !current) return null;
  return (
    <section className="queue-panel floating" data-testid="queue-panel" aria-label="Hàng chờ">
      <div className="qlast" data-testid="queue-last" title={current.error ?? undefined}>
        Hàng chờ rảnh · lần chạy trước: <b className={`run-${current.status}`}>{RUN_LABEL[current.status]}</b>
        {current.error ? ` — ${current.error}` : ""}
      </div>
    </section>
  );
}
