import { stableStringify, withoutDefaultTake } from "../../shared/hash";
import type { WorkflowGraph } from "../../shared/workflow";

// Kết quả nào của lần chạy cũ còn đúng với workflow đang lưu? (GET /api/workflows/:id/runs/latest). Hàm thuần.
//
// Một node chỉ hiện kết quả khi:
// 1. tham số của nó TRONG ĐỒ THỊ CỦA LẦN CHẠY đã tạo ra dòng kết quả (runs.graph_json) giống hệt tham số trong workflow đang lưu;
// 2. với mỗi node U nối vào nó, kết quả U đang hiện KHÔNG MỚI HƠN kết quả U mà lần chạy của node này đã dùng (cùng khoá cache; không
//    biết khoá thì chỉ chấp nhận cùng lần chạy hoặc dòng "dùng lại"). Chạy riêng một cảnh (take mới) rồi Ghép phim vẫn là dòng của
//    lần chạy trước: phim cũ làm từ clip cũ, không được hiện như hiện hành;
// 3. mọi node nối vào nó cũng đang hiện kết quả (lan xuống phía sau).
// Còn lại hiện "Chưa chạy", không kèm ảnh/phim cũ.
//
// `take` (số lần "Chạy lại (bản mới)") CÓ tính: take đổi thì khoá bước con đổi, tức là một lần tạo khác. Lần chạy lại chưa xong
// không được hiện kết quả của take cũ. Riêng take = 1 là mặc định, không tính (cùng quy tắc với khoá cache: withoutDefaultTake()).

// Tham số dạng chữ để so sánh: qua JSON (như snapshotGroup) nên trường undefined không làm khác, khoá xếp cố định.
export function paramsKey(params: unknown): string {
  return stableStringify(withoutDefaultTake(JSON.parse(JSON.stringify(params ?? null))));
}

// Tham số từng node trong đồ thị của một lần chạy.
export function paramsOfGraph(graph: Pick<WorkflowGraph, "nodes">): Map<string, string> {
  return new Map(graph.nodes.map((n) => [n.id, paramsKey(n.params)]));
}

export type ResultRow<T> = { nodeId: string; runId: string; cacheKey: string | null; status: string; state: T };

// Mỗi node lấy dòng mới nhất (dòng đầu tiên khi `rows` xếp MỚI NHẤT TRƯỚC), chỉ cho node còn trong đồ thị hiện tại.
export function newestRows<T>(rows: readonly ResultRow<T>[], current: Pick<WorkflowGraph, "nodes">): Map<string, ResultRow<T>> {
  const inGraph = new Set(current.nodes.map((n) => n.id));
  const newest = new Map<string, ResultRow<T>>();
  for (const row of rows) if (inGraph.has(row.nodeId) && !newest.has(row.nodeId)) newest.set(row.nodeId, row);
  return newest;
}

// `rows`: MỌI dòng kết quả của các node trong workflow, mới nhất trước. `runParams`: mã lần chạy → tham số từng node của lần đó,
// chỉ cần cho các lần chạy có dòng mới nhất của một node (newestRows); lần chạy không có trong bảng (đồ thị không đọc được) thì
// không kiểm chứng được nên không hiện gì của nó.
export function freshResults<T>(
  rows: readonly ResultRow<T>[],
  runParams: ReadonlyMap<string, ReadonlyMap<string, string>>,
  current: Pick<WorkflowGraph, "nodes" | "edges">,
): { shown: Map<string, T>; outdated: string[] } {
  const currentParams = paramsOfGraph(current);
  const newest = newestRows(rows, current);
  const inRun = new Map<string, ResultRow<T>>();
  for (const row of rows) inRun.set(`${row.runId}\u0000${row.nodeId}`, row);

  const kept = new Map<string, ResultRow<T>>();
  for (const [id, row] of newest) if (runParams.get(row.runId)?.get(id) === currentParams.get(id)) kept.set(id, row);

  // Kết quả của nguồn `u` đang hiện có mới hơn kết quả mà lần chạy của `x` đã dùng không?
  const newerThanUsed = (u: ResultRow<T>, x: ResultRow<T>): boolean => {
    if (u.runId === x.runId) return false;
    const used = inRun.get(`${x.runId}\u0000${u.nodeId}`);
    if (u.cacheKey !== null && used?.cacheKey !== null && used?.cacheKey !== undefined) return u.cacheKey !== used.cacheKey;
    return u.status !== "cached";
  };

  // Lan xuống phía sau, lặp tới khi hết thay đổi (thứ tự dây trong mảng tuỳ ý).
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of current.edges) {
      const target = kept.get(e.target);
      if (!target) continue;
      const source = kept.get(e.source);
      if (!source || newerThanUsed(source, target)) {
        kept.delete(e.target);
        changed = true;
      }
    }
  }
  // `outdated`: node từng có kết quả mà không còn hiện (để khung Kết quả nói rõ "đã đổi sau lần chạy cuối", khác với chưa chạy bao giờ).
  return { shown: new Map([...kept].map(([id, row]) => [id, row.state])), outdated: [...newest.keys()].filter((id) => !kept.has(id)) };
}
