import { stableStringify } from "../../shared/hash";
import type { WorkflowGraph } from "../../shared/workflow";

// Kết quả nào của lần chạy cũ còn đúng với workflow đang lưu? (GET /api/workflows/:id/runs/latest). Hàm thuần.
//
// Một node chỉ hiện kết quả khi:
// 1. tham số của nó TRONG ĐỒ THỊ CỦA LẦN CHẠY đã tạo ra dòng kết quả (runs.graph_json) giống hệt tham số trong workflow đang lưu,
// 2. mọi node nối vào nó cũng đang hiện kết quả (đầu vào đổi thì kết quả phía sau không còn đúng: Ghép phim sau khi thẻ cảnh bị thay).
// Còn lại hiện "Chưa chạy", không kèm ảnh/phim cũ.
//
// `take` (số lần "Chạy lại (bản mới)") CÓ tính: take đổi thì khoá bước con đổi, tức là một lần tạo khác. Lần chạy lại chưa xong
// không được hiện kết quả của take cũ như kết quả hiện hành.

// Tham số dạng chữ để so sánh: qua JSON (như snapshotGroup) nên trường undefined không làm khác, khoá xếp cố định.
export function paramsKey(params: unknown): string {
  return stableStringify(JSON.parse(JSON.stringify(params ?? null)));
}

// Tham số từng node trong đồ thị của một lần chạy.
export function paramsOfGraph(graph: Pick<WorkflowGraph, "nodes">): Map<string, string> {
  return new Map(graph.nodes.map((n) => [n.id, paramsKey(n.params)]));
}

export type ResultRow<T> = { nodeId: string; runId: string; state: T };

// `rows`: mọi dòng kết quả, MỚI NHẤT TRƯỚC (mỗi node lấy dòng đầu tiên). `runParams`: mã lần chạy → tham số từng node của lần đó;
// lần chạy không có trong bảng (đồ thị không đọc được) thì không kiểm chứng được nên không hiện gì của nó.
export function freshResults<T>(
  rows: readonly ResultRow<T>[],
  runParams: ReadonlyMap<string, ReadonlyMap<string, string>>,
  current: Pick<WorkflowGraph, "nodes" | "edges">,
): { shown: Map<string, T>; outdated: string[] } {
  const currentParams = paramsOfGraph(current);
  const shown = new Map<string, T>();
  const ran = new Set<string>();
  for (const row of rows) {
    if (ran.has(row.nodeId) || !currentParams.has(row.nodeId)) continue;
    ran.add(row.nodeId);
    if (runParams.get(row.runId)?.get(row.nodeId) === currentParams.get(row.nodeId)) shown.set(row.nodeId, row.state);
  }
  // Lan xuống phía sau: node có dây từ một node không còn kết quả (đổi tham số, hoặc chưa có kết quả nào) thì cũng bỏ.
  // Lặp tới khi hết thay đổi (đồ thị không có chu trình nhưng thứ tự dây thì tuỳ ý).
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of current.edges) {
      if (shown.has(e.target) && !shown.has(e.source)) {
        shown.delete(e.target);
        changed = true;
      }
    }
  }
  // `outdated`: node từng có kết quả mà không còn hiện (để khung Kết quả nói rõ "đã đổi sau lần chạy cuối", khác với chưa chạy bao giờ).
  return { shown, outdated: [...ran].filter((id) => !shown.has(id)) };
}
