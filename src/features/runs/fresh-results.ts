import { GraphError, nodeKeyOf, planGraph } from "../../core/executor";
import type { ServerNode } from "../../core/node-runtime";
import { stableStringify, withoutDefaultTake } from "../../shared/hash";
import type { WorkflowGraph } from "../../shared/workflow";

// Kết quả nào của lần chạy cũ còn đúng với workflow đang lưu? (GET /api/workflows/:id/runs/latest). Hàm thuần (không đọc db).
//
// Một kiểm tra duy nhất: node X hiện kết quả ⇔ khoá cache của dòng X đang hiện đúng bằng khoá tính lại từ đồ thị HIỆN TẠI
// (nodeKeyOf của máy chủ: loại node, tham số đã qua zod và bỏ take mặc định, khoá của các node nguồn theo từng cổng, cổng nhiều
// dây theo đúng thứ tự orderSources, phiên bản prompt), với khoá nguồn là khoá của dòng nguồn đang hiện. Một phép so này gồm
// luôn: tham số đổi, `take` đổi, nguồn có kết quả mới hơn kết quả X đã dùng (chạy riêng một cảnh), đổi dây, đổi thứ tự clip.
// Duyệt theo thứ tự đồ thị: nguồn bị bỏ (hoặc chưa có kết quả) thì mọi node nhận từ nó cũng bị bỏ.
//
// Dòng không có khoá (lần chạy hiển thị của workflow cũ, dòng bỏ qua/lỗi), hoặc khoá không đáng tin (khoá lưu khác khoá tính lại từ
// chính đồ thị của lần chạy đó: phiên bản prompt đã đổi từ sau lần chạy), hoặc nguồn có dòng không khoá, hoặc đồ thị hiện tại
// không lập được kế hoạch (thiếu dây bắt buộc): kiểm tra yếu hơn nhưng không để "Xong" giả:
//   - tham số và các dây vào của X trong đồ thị của lần chạy của nó giống hệt hiện tại, VÀ
//   - mỗi nguồn U hoặc có dòng đang hiện nằm cùng lần chạy với X, hoặc có đầu ra (outputJson) y hệt dòng U trong lần chạy của X.
//     U không có dòng trong lần chạy của X, hoặc không có đầu ra để so, thì bỏ. (Dòng "dùng lại" không chứng minh X đã dùng đầu ra nào.)
//
// Còn lại hiện "Chưa chạy", không kèm ảnh/phim cũ.

// Tham số dạng chữ để so sánh: qua JSON (như snapshotGroup) nên trường undefined không làm khác, khoá xếp cố định, take mặc định
// không tính (cùng quy tắc khoá cache: withoutDefaultTake()). Take khác mặc định CÓ tính: lần chạy lại chưa xong không hiện kết quả take cũ.
export function paramsKey(params: unknown): string {
  return stableStringify(withoutDefaultTake(JSON.parse(JSON.stringify(params ?? null))));
}

// Các dây vào từng node (nguồn.cổng ra → cổng vào, xếp cố định) dạng chữ: so dây giữa hai đồ thị khi không tính được khoá.
export function wiresOfGraph(graph: Pick<WorkflowGraph, "edges">): Map<string, string> {
  const wires = new Map<string, string[]>();
  for (const e of graph.edges) wires.set(e.target, [...(wires.get(e.target) ?? []), `${e.source}.${e.sourceHandle}>${e.targetHandle}`]);
  return new Map([...wires].map(([id, list]) => [id, list.sort().join(",")]));
}

// Tham số từng node trong đồ thị của một lần chạy.
export function paramsOfGraph(graph: Pick<WorkflowGraph, "nodes">): Map<string, string> {
  return new Map(graph.nodes.map((n) => [n.id, paramsKey(n.params)]));
}

export type ResultRow<T> = { nodeId: string; runId: string; cacheKey: string | null; status: string; outputJson: string | null; state: T };

// Khoá cache của node `nodeId` trong một đồ thị, cho khoá các node nguồn (keyOf); undefined khi không tính được.
export type KeyFn = (nodeId: string, keyOf: (sourceId: string) => string | undefined) => string | undefined;
export type KeyFnFor = (graph: WorkflowGraph) => KeyFn | undefined;

// Dựng KeyFn từ đúng hàm của máy chủ (planGraph + nodeKeyOf, không viết lại công thức khoá). Đồ thị không lập được kế hoạch
// (thiếu dây bắt buộc, tham số hỏng, có vòng) thì undefined; lỗi khác ném tiếp.
export function keyFnFor(nodes: Record<string, ServerNode>): KeyFnFor {
  return (graph) => {
    let order;
    try {
      order = planGraph(graph, nodes);
    } catch (err) {
      if (err instanceof GraphError) return undefined;
      throw err;
    }
    const planned = new Map(order.map((p) => [p.node.id, p]));
    return (nodeId, keyOf) => {
      const p = planned.get(nodeId);
      return p ? nodeKeyOf(p, graph, keyOf) : undefined;
    };
  };
}

// Mỗi node lấy dòng mới nhất (dòng đầu tiên khi `rows` xếp MỚI NHẤT TRƯỚC), chỉ cho node còn trong đồ thị hiện tại.
export function newestRows<T>(rows: readonly ResultRow<T>[], current: Pick<WorkflowGraph, "nodes">): Map<string, ResultRow<T>> {
  const inGraph = new Set(current.nodes.map((n) => n.id));
  const newest = new Map<string, ResultRow<T>>();
  for (const row of rows) if (inGraph.has(row.nodeId) && !newest.has(row.nodeId)) newest.set(row.nodeId, row);
  return newest;
}

// Thứ tự nguồn trước đích (Kahn); node nằm trong vòng thì không có mặt.
function topoOrder(graph: Pick<WorkflowGraph, "nodes" | "edges">): string[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const waiting = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  const next = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    waiting.set(e.target, (waiting.get(e.target) ?? 0) + 1);
    next.set(e.source, [...(next.get(e.source) ?? []), e.target]);
  }
  const ready = [...waiting].filter(([, n]) => n === 0).map(([id]) => id);
  const order: string[] = [];
  for (let i = 0; i < ready.length; i++) {
    const id = ready[i]!;
    order.push(id);
    for (const t of next.get(id) ?? []) {
      const left = (waiting.get(t) ?? 0) - 1;
      waiting.set(t, left);
      if (left === 0) ready.push(t);
    }
  }
  return order;
}

// `rows`: MỌI dòng kết quả của các node trong workflow, mới nhất trước. `runGraphs`: mã lần chạy → đồ thị của lần đó, chỉ cần cho các
// lần chạy có dòng mới nhất của một node (newestRows); lần chạy không có trong bảng (đồ thị không đọc được) thì không kiểm chứng
// được nên không hiện gì của nó.
export function freshResults<T>(
  rows: readonly ResultRow<T>[],
  runGraphs: ReadonlyMap<string, WorkflowGraph>,
  current: WorkflowGraph,
  keyFor: KeyFnFor,
): { shown: Map<string, T>; outdated: string[] } {
  const currentParams = paramsOfGraph(current);
  const newest = newestRows(rows, current);
  const inRun = new Map<string, ResultRow<T>>();
  for (const row of rows) inRun.set(`${row.runId}\u0000${row.nodeId}`, row);
  const sourcesOf = new Map<string, string[]>();
  for (const e of current.edges) sourcesOf.set(e.target, [...new Set([...(sourcesOf.get(e.target) ?? []), e.source])]);

  const runParams = new Map<string, Map<string, string>>();
  const paramsIn = (runId: string) => {
    const graph = runGraphs.get(runId);
    if (!graph) return undefined;
    if (!runParams.has(runId)) runParams.set(runId, paramsOfGraph(graph));
    return runParams.get(runId);
  };
  const runKeyFns = new Map<string, KeyFn | undefined>();
  const keyFnOfRun = (runId: string) => {
    const graph = runGraphs.get(runId);
    if (!graph) return undefined;
    if (!runKeyFns.has(runId)) runKeyFns.set(runId, keyFor(graph));
    return runKeyFns.get(runId);
  };
  const currentWires = wiresOfGraph(current);
  const runWires = new Map<string, Map<string, string>>();
  const wiresIn = (runId: string) => {
    const graph = runGraphs.get(runId);
    if (!graph) return undefined;
    if (!runWires.has(runId)) runWires.set(runId, wiresOfGraph(graph));
    return runWires.get(runId);
  };
  const currentKeyFn = keyFor(current);

  // Khoá của dòng đáng tin khi nó đúng là khoá mà code hiện tại tính ra cho đồ thị của chính lần chạy đó (không phải khoá cũ của
  // phiên bản prompt trước, cũng không phải dòng hiển thị của workflow cũ).
  const trusted = (row: ResultRow<T>): boolean => {
    if (row.cacheKey === null) return false;
    const keyOf = keyFnOfRun(row.runId);
    return keyOf?.(row.nodeId, (id) => inRun.get(`${row.runId}\u0000${id}`)?.cacheKey ?? undefined) === row.cacheKey;
  };

  const kept = new Map<string, ResultRow<T>>();
  for (const id of topoOrder(current)) {
    const row = newest.get(id);
    if (!row) continue;
    const sources = (sourcesOf.get(id) ?? []).map((s) => kept.get(s));
    if (sources.some((s) => s === undefined)) continue;
    const upstream = sources as ResultRow<T>[];

    let fresh: boolean;
    if (currentKeyFn && trusted(row) && upstream.every((u) => u.cacheKey !== null)) {
      const byId = new Map(upstream.map((u) => [u.nodeId, u.cacheKey ?? undefined]));
      fresh = currentKeyFn(id, (sid) => byId.get(sid)) === row.cacheKey;
    } else {
      fresh =
        paramsIn(row.runId)?.get(id) === currentParams.get(id) &&
        (wiresIn(row.runId)?.get(id) ?? "") === (currentWires.get(id) ?? "") &&
        upstream.every((u) => {
          if (u.runId === row.runId) return true;
          const used = inRun.get(`${row.runId}\u0000${u.nodeId}`);
          return used !== undefined && used.outputJson !== null && u.outputJson !== null && used.outputJson === u.outputJson;
        });
    }
    if (fresh) kept.set(id, row);
  }
  // `outdated`: node từng có kết quả mà không còn hiện (để khung Kết quả nói rõ "đã đổi sau lần chạy cuối", khác với chưa chạy bao giờ).
  return { shown: new Map([...kept].map(([id, row]) => [id, row.state])), outdated: [...newest.keys()].filter((id) => !kept.has(id)) };
}
