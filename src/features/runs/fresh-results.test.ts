import { describe, expect, it } from "vitest";
import { computeKeys, planGraph } from "../../core/executor";
import { serverNodes } from "../../nodes/registry.server";
import { WorkflowGraphSchema, type WorkflowGraph } from "../../shared/workflow";
import { freshResults, graphRules, paramsKey, type ResultRow } from "./fresh-results";

// Dùng đúng các node thật và đúng hàm khoá của máy chủ (planGraph + computeKeys) để dựng "các lần chạy": dòng nào cũng mang khoá
// như máy chủ sẽ ghi, nên các ca dưới đây kiểm đúng phép so khoá chứ không phải một công thức viết lại.
const rules = graphRules(serverNodes);
// `display`: mã các lần chạy hiển thị của workflow cũ (máy chủ nhận ra bằng dòng mang OLD_RESULT_MESSAGE).
const fresh = <T>(rows: readonly ResultRow<T>[], graphs: ReadonlyMap<string, WorkflowGraph>, current: WorkflowGraph, display: string[] = []) =>
  freshResults(rows, graphs, new Set(display), current, rules);

const prompt = (id: string, text: string) => ({ id, type: "prompt", position: { x: 0, y: 0 }, params: { text } });
const video = (id: string, durationSec: 5 | 10 = 5) => ({ id, type: "generate-video", position: { x: 300, y: 0 }, params: { provider: "fake", durationSec } });
const combine = (params: Record<string, unknown> = { fixBrightness: true }) => ({ id: "c", type: "film-combine", position: { x: 600, y: 0 }, params });
const wire = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({ id: `${source}-${target}`, source, sourceHandle, target, targetHandle });
const toVideo = (p: string, v: string) => wire(p, "text", v, "prompt");
const toCombine = (v: string) => wire(v, "video", "c", "clips");

const makeGraph = (nodes: object[], edges: object[]): WorkflowGraph => WorkflowGraphSchema.parse({ nodes, edges });

// p1 → v1 ─┐
//          ├→ c (Ghép phim)
// p2 → v2 ─┘
const base = (extra: { v1?: 5 | 10; order?: string[] } = {}) =>
  makeGraph(
    [prompt("p1", "rừng sương"), prompt("p2", "suối đá"), video("v1", extra.v1 ?? 5), video("v2"), combine(extra.order ? { fixBrightness: true, order: extra.order } : undefined)],
    [toVideo("p1", "v1"), toVideo("p2", "v2"), toCombine("v1"), toCombine("v2")],
  );

// Các dòng một lần chạy ghi ra: khoá như máy chủ tính, đầu ra gắn với khoá (cùng khoá thì cùng đầu ra). `scope`: chỉ các node này.
function ran(runId: string, graph: WorkflowGraph, scope?: string[], status = "succeeded"): ResultRow<string>[] {
  const keys = computeKeys(planGraph(graph, serverNodes), graph);
  return graph.nodes
    .filter((n) => !scope || scope.includes(n.id))
    .map((n) => ({ nodeId: n.id, runId, cacheKey: keys.get(n.id)!, status, outputJson: `out:${keys.get(n.id)}`, state: `${n.id}@${runId}` }));
}
const runsOf = (g: Record<string, WorkflowGraph>) => new Map(Object.entries(g));
const shown = (out: { shown: Map<string, string> }) => [...out.shown.keys()].sort();

describe("freshResults — khoá cache tính lại từ đồ thị hiện tại", () => {
  it("(1) một lần chạy cả workflow: giữ hết", () => {
    const g = base();
    const out = fresh(ran("r1", g), runsOf({ r1: g }), g);
    expect(shown(out)).toEqual(["c", "p1", "p2", "v1", "v2"]);
    expect(out.outdated).toEqual([]);
  });

  it("(2) lần chạy cả workflow sau đó mọi dòng 'dùng lại' với cùng khoá: giữ hết, hiện dòng của lần sau", () => {
    const g = base();
    const out = fresh([...ran("r2", g, undefined, "cached"), ...ran("r1", g)], runsOf({ r1: g, r2: g }), g);
    expect(shown(out)).toEqual(["c", "p1", "p2", "v1", "v2"]);
    expect(out.shown.get("c")).toBe("c@r2");
  });

  it("(3) chạy lại riêng một cảnh với bản mới: cảnh có kết quả mới, Ghép phim (dòng của lần chạy trước) bị bỏ", () => {
    const g1 = base();
    const g2 = base({ v1: 10 });
    const out = fresh([...ran("r2", g2, ["p1", "v1"]), ...ran("r1", g1)], runsOf({ r1: g1, r2: g2 }), g2);
    expect(shown(out)).toEqual(["p1", "p2", "v1", "v2"]);
    expect(out.outdated).toEqual(["c"]);
  });

  it("(3b) chạy lại riêng cảnh đó với cùng tham số (dùng lại, cùng khoá): Ghép phim vẫn đúng", () => {
    const g = base();
    const out = fresh([...ran("r2", g, ["p1", "v1"], "cached"), ...ran("r1", g)], runsOf({ r1: g, r2: g }), g);
    expect(out.outdated).toEqual([]);
  });

  it("(4) workflow cũ vừa chuyển (dòng hiển thị không khoá): chạy lại cảnh bản mới rồi 'Chạy node này' (dòng 'dùng lại') thì Ghép phim vẫn bị bỏ", () => {
    const g1 = base();
    const g2 = base({ v1: 10 });
    // Lần chạy hiển thị: node giữ mã mang khoá cũ, cảnh và Ghép phim không khoá, dòng 'dùng lại' (như writeDisplayRun).
    const legacy = (id: string, key: string | null, status: string): ResultRow<string> => ({ nodeId: id, runId: "d", cacheKey: key, status, outputJson: `legacy:${id}`, state: `${id}@d` });
    const display = [legacy("p1", "khoa-cu-p1", "succeeded"), legacy("p2", "khoa-cu-p2", "succeeded"), legacy("v1", null, "cached"), legacy("v2", null, "cached"), legacy("c", null, "cached")];
    const rerunTake = ran("r1", g2, ["p1", "v1"]);
    const runNodeCached = ran("r2", g2, ["p1", "v1"], "cached");
    const graphs = runsOf({ d: g1, r1: g2, r2: g2 });

    const afterRerun = fresh([...rerunTake, ...display], graphs, g2, ["d"]);
    expect(afterRerun.outdated).toEqual(["c"]);
    const afterRunNode = fresh([...runNodeCached, ...rerunTake, ...display], graphs, g2, ["d"]);
    expect(afterRunNode.outdated).toEqual(["c"]);
    expect(afterRunNode.shown.get("v1")).toBe("v1@r2");
    expect(shown(afterRunNode)).toEqual(["p1", "p2", "v1", "v2"]);
  });

  it("(5) nguồn nối thêm sau khi node nhận đã chạy, rồi nguồn đó chạy riêng (dòng 'dùng lại'): node nhận chưa từng dùng nó nên bị bỏ", () => {
    const g1 = base();
    const g2 = makeGraph([...g1.nodes, prompt("p3", "đồi cỏ"), video("v3")], [...g1.edges, toVideo("p3", "v3"), toCombine("v3")]);
    const out = fresh([...ran("r2", g2, ["p3", "v3"], "cached"), ...ran("r1", g1)], runsOf({ r1: g1, r2: g2 }), g2);
    expect(out.outdated).toEqual(["c"]);
    expect(shown(out)).toEqual(["p1", "p2", "p3", "v1", "v2", "v3"]);
  });

  it("(5b) nguồn mới nối vào mà chưa chạy lần nào: node nhận bị bỏ", () => {
    const g1 = base();
    const g2 = makeGraph([...g1.nodes, prompt("p3", "đồi cỏ"), video("v3")], [...g1.edges, toVideo("p3", "v3"), toCombine("v3")]);
    const out = fresh(ran("r1", g1), runsOf({ r1: g1 }), g2);
    expect(out.outdated).toEqual(["c"]);
  });

  it("(6) đổi dây vào Ghép phim sang một nguồn khác cùng kiểu đầu ra: bị bỏ", () => {
    const g1 = base();
    const g2 = makeGraph(
      [...g1.nodes, prompt("p3", "đồi cỏ"), video("v3")],
      [toVideo("p1", "v1"), toVideo("p2", "v2"), toVideo("p3", "v3"), toCombine("v1"), toCombine("v3")],
    );
    const out = fresh([...ran("r2", g2, ["p3", "v3"]), ...ran("r1", g1)], runsOf({ r1: g1, r2: g2 }), g2);
    expect(out.outdated).toEqual(["c"]);
    expect(shown(out)).toContain("v2");
  });

  it("(7) đổi thứ tự clip (order) của Ghép phim, cùng các clip: Ghép phim bị bỏ, các cảnh giữ", () => {
    const g1 = base();
    const g2 = base({ order: ["v2", "v1"] });
    const out = fresh(ran("r1", g1), runsOf({ r1: g1 }), g2);
    expect(out.outdated).toEqual(["c"]);
    expect(shown(out)).toEqual(["p1", "p2", "v1", "v2"]);
  });

  it("(7b) order ghi lại đúng thứ tự mặc định thì khoá khác (order nằm trong tham số): máy chủ coi là một lần ghép khác", () => {
    const g1 = base();
    const g2 = base({ order: ["v1", "v2"] });
    expect(fresh(ran("r1", g1), runsOf({ r1: g1 }), g2).outdated).toEqual(["c"]);
  });

  it("(8) lần chạy hiển thị của workflow cũ, chưa ai đụng: giữ hết", () => {
    const g = base();
    const legacy = (id: string, key: string | null, status: string): ResultRow<string> => ({ nodeId: id, runId: "d", cacheKey: key, status, outputJson: `legacy:${id}`, state: `${id}@d` });
    const display = [legacy("p1", "khoa-cu-p1", "succeeded"), legacy("p2", "khoa-cu-p2", "succeeded"), legacy("v1", null, "cached"), legacy("v2", null, "cached"), legacy("c", null, "cached")];
    const out = fresh(display, runsOf({ d: g }), g, ["d"]);
    expect(shown(out)).toEqual(["c", "p1", "p2", "v1", "v2"]);
    expect(out.outdated).toEqual([]);
  });

  it("(8b) dòng hiển thị cũ nhưng một cảnh đã sửa tham số: cảnh đó và Ghép phim bị bỏ, phần còn lại giữ", () => {
    const g1 = base();
    const g2 = base({ v1: 10 });
    const legacy = (id: string, key: string | null): ResultRow<string> => ({ nodeId: id, runId: "d", cacheKey: key, status: "cached", outputJson: `legacy:${id}`, state: `${id}@d` });
    const display = ["p1", "p2", "v1", "v2", "c"].map((id) => legacy(id, null));
    const out = fresh(display, runsOf({ d: g1 }), g2, ["d"]);
    expect(out.outdated.sort()).toEqual(["c", "v1"]);
    expect(shown(out)).toEqual(["p1", "p2", "v2"]);
  });
});

describe("freshResults — các nhánh còn lại", () => {
  it("khoá lưu khác khoá tính lại từ chính đồ thị của lần chạy (phiên bản prompt đã đổi), lần chạy thường: bỏ, đúng như ước tính (node sẽ chạy lại)", () => {
    const g = base();
    const drifted = ran("r1", g).map((r) => ({ ...r, cacheKey: `khoa-cua-ban-truoc-${r.nodeId}` }));
    const out = fresh(drifted, runsOf({ r1: g }), g);
    expect(out.shown.size).toBe(0);
    expect(out.outdated.sort()).toEqual(["c", "p1", "p2", "v1", "v2"]);
    // Chỉ một node lệch khoá: node đó và mọi node phía sau bị bỏ, phần còn lại giữ.
    const oneDrifted = ran("r1", g).map((r) => (r.nodeId === "p1" ? { ...r, cacheKey: "khoa-cua-ban-truoc-p1" } : r));
    expect(shown(fresh(oneDrifted, runsOf({ r1: g }), g))).toEqual(["p2", "v2"]);
  });

  it("khoá lưu khác khoá tính lại, nhưng là lần chạy hiển thị của workflow cũ: kiểm yếu, tham số không đổi thì vẫn giữ", () => {
    const g = base();
    const drifted = ran("d", g).map((r) => ({ ...r, cacheKey: `khoa-cua-ban-truoc-${r.nodeId}` }));
    const out = fresh(drifted, runsOf({ d: g }), g, ["d"]);
    expect(out.outdated).toEqual([]);
    const edited = base({ v1: 10 });
    expect(fresh(drifted, runsOf({ d: g }), edited, ["d"]).outdated.sort()).toEqual(["c", "v1"]);
    // Lần chạy khác không phải lần chạy hiển thị thì không được ngoại lệ này.
    expect(fresh(drifted, runsOf({ d: g }), g, ["r-khac"]).shown.size).toBe(0);
  });

  it("nguồn chạy lại ở lần chạy khác, dòng không khoá và đầu ra khác: bỏ; đầu ra y hệt: giữ", () => {
    const g = base();
    const noKey = (rows: ResultRow<string>[]) => rows.map((r) => ({ ...r, cacheKey: null }));
    const r1 = noKey(ran("r1", g));
    const same = noKey(ran("r2", g, ["p1", "v1"], "cached"));
    expect(fresh([...same, ...r1], runsOf({ r1: g, r2: g }), g).outdated).toEqual([]);
    const changed = noKey(ran("r2", g, ["p1", "v1"])).map((r) => ({ ...r, outputJson: `out-moi:${r.nodeId}` }));
    expect(fresh([...changed, ...r1], runsOf({ r1: g, r2: g }), g).outdated).toEqual(["c"]);
  });

  it("nguồn không có dòng nào trong lần chạy của node nhận, hoặc không có đầu ra để so: bỏ", () => {
    const g = base();
    const noKey = (rows: ResultRow<string>[]) => rows.map((r) => ({ ...r, cacheKey: null }));
    const missing = noKey(ran("r1", g)).filter((r) => r.nodeId !== "v1");
    expect(fresh([...noKey(ran("r2", g, ["p1", "v1"])), ...missing], runsOf({ r1: g, r2: g }), g).outdated).toEqual(["c"]);
    const noOutput = [...noKey(ran("r2", g, ["p1", "v1"])).map((r) => ({ ...r, outputJson: null })), ...noKey(ran("r1", g))];
    expect(fresh(noOutput, runsOf({ r1: g, r2: g }), g).outdated).toEqual(["c"]);
  });

  it("đồ thị hiện tại không lập được kế hoạch (thiếu dây bắt buộc): vẫn kiểm bằng tham số và đầu ra, không ném lỗi, trả lý do để ghi log", () => {
    const g = base();
    const broken = makeGraph(g.nodes, g.edges.filter((e) => e.id !== "p2-v2"));
    const out = fresh(ran("r1", g), runsOf({ r1: g }), broken);
    expect(out.shown.has("v2")).toBe(false);
    expect(out.shown.has("p1")).toBe(true);
    expect(out.unplannable).toContain("chưa nối cổng vào");
    expect(fresh(ran("r1", g), runsOf({ r1: g }), g).unplannable).toBeNull();
  });

  // Ghép phim dựng tay (không có `order` đủ): thứ tự clip theo toạ độ thẻ nguồn. Nhánh kiểm yếu phải so đúng thứ tự đó.
  // Dòng không khoá (như lần chạy hiển thị) để buộc đi nhánh kiểm yếu.
  const placed = (x1: number, x2: number) =>
    makeGraph(
      [prompt("p1", "rừng sương"), prompt("p2", "suối đá"), { ...video("v1"), position: { x: x1, y: 0 } }, { ...video("v2"), position: { x: x2, y: 0 } }, combine()],
      [toVideo("p1", "v1"), toVideo("p2", "v2"), toCombine("v1"), toCombine("v2")],
    );
  const unkeyed = (rows: ResultRow<string>[]) => rows.map((r) => ({ ...r, cacheKey: null }));

  it("nhánh kiểm yếu, Ghép phim không có order: kéo thẻ cảnh làm đổi thứ tự clip thì Ghép phim bị bỏ, các cảnh giữ", () => {
    const g1 = placed(300, 500);
    const swapped = placed(700, 500);
    const out = fresh(unkeyed(ran("d", g1)), runsOf({ d: g1 }), swapped, ["d"]);
    expect(out.outdated).toEqual(["c"]);
    expect(shown(out)).toEqual(["p1", "p2", "v1", "v2"]);
  });

  it("nhánh kiểm yếu, Ghép phim không có order: kéo thẻ cảnh mà thứ tự clip không đổi thì giữ", () => {
    const g1 = placed(300, 500);
    const moved = makeGraph(
      placed(400, 500).nodes.map((n) => (n.id === "v2" ? { ...n, position: { x: 500, y: 250 } } : n)),
      g1.edges,
    );
    const out = fresh(unkeyed(ran("d", g1)), runsOf({ d: g1 }), moved, ["d"]);
    expect(out.outdated).toEqual([]);
    expect(shown(out)).toEqual(["c", "p1", "p2", "v1", "v2"]);
  });

  it("nhánh kiểm yếu, Ghép phim có order đủ: kéo thẻ cảnh không đổi thứ tự (order quyết định) nên giữ", () => {
    const withOrder = (x1: number) => makeGraph(placed(x1, 500).nodes.map((n) => (n.id === "c" ? combine({ fixBrightness: true, order: ["v1", "v2"] }) : n)), placed(x1, 500).edges);
    const out = fresh(unkeyed(ran("d", withOrder(300))), runsOf({ d: withOrder(300) }), withOrder(700), ["d"]);
    expect(out.outdated).toEqual([]);
  });

  it("node đã xoá khỏi workflow không xuất hiện; node chưa từng chạy không nằm trong outdated; lần chạy không đọc được đồ thị thì không hiện gì", () => {
    const g = base();
    const smaller = makeGraph(g.nodes.filter((n) => n.id !== "c"), g.edges.filter((e) => e.target !== "c"));
    const out = fresh(ran("r1", g), runsOf({ r1: g }), smaller);
    expect(shown(out)).toEqual(["p1", "p2", "v1", "v2"]);
    expect(fresh([], new Map(), g).outdated).toEqual([]);
    const lost = fresh(ran("r1", g), new Map(), g);
    expect(lost.shown.size).toBe(0);
    expect(lost.outdated.sort()).toEqual(["c", "p1", "p2", "v1", "v2"]);
  });

  it("chỉ xét dòng mới nhất của mỗi node: dòng mới nhất khác khoá thì bỏ, dù dòng cũ hơn khớp", () => {
    const g1 = base();
    const g2 = base({ v1: 10 });
    const out = fresh([...ran("r2", g2, ["p1", "v1"]), ...ran("r1", g1)], runsOf({ r1: g1, r2: g2 }), g1);
    expect(out.shown.has("v1")).toBe(false);
  });
});

describe("paramsKey", () => {
  it("thứ tự khoá và trường undefined không phải là khác biệt; giá trị khác thì khác", () => {
    expect(paramsKey({ a: 1, b: { x: 1, y: undefined } })).toBe(paramsKey({ b: { x: 1 }, a: 1 }));
    expect(paramsKey({ a: 1 })).not.toBe(paramsKey({ a: 2 }));
    expect(paramsKey(undefined)).toBe(paramsKey(null));
  });

  it("take = 1 là mặc định, giống khoá cache: có hay không cũng như nhau; take khác 1 thì khác", () => {
    expect(paramsKey({ a: 1, take: 1 })).toBe(paramsKey({ a: 1 }));
    expect(paramsKey({ a: 1, take: 2 })).not.toBe(paramsKey({ a: 1 }));
  });
});
