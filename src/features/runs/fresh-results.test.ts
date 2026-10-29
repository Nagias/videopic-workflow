import { describe, expect, it } from "vitest";
import { freshResults, paramsKey, paramsOfGraph, type ResultRow } from "./fresh-results";

const node = (id: string, params: Record<string, unknown> = {}) => ({ id, type: "x", position: { x: 0, y: 0 }, params });
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, sourceHandle: "o", target, targetHandle: "i" });
const graph = (nodes: ReturnType<typeof node>[], edges: ReturnType<typeof edge>[] = []) => ({ nodes, edges });
const row = (nodeId: string, runId: string, cacheKey: string | null = null, status = "succeeded"): ResultRow<string> => ({
  nodeId,
  runId,
  cacheKey,
  status,
  state: `${nodeId}@${runId}`,
});
const runs = (g: Record<string, ReturnType<typeof graph>>) => new Map(Object.entries(g).map(([id, gr]) => [id, paramsOfGraph(gr)]));

describe("freshResults — kết quả cũ nào còn đúng với workflow đang lưu", () => {
  it("node giữ nguyên tham số thì giữ kết quả; tham số khác thì bỏ và ghi vào outdated", () => {
    const ran = graph([node("a", { text: "x" }), node("b", { text: "y" })]);
    const now = graph([node("a", { text: "x" }), node("b", { text: "đã sửa" })]);
    const out = freshResults([row("a", "r1"), row("b", "r1")], runs({ r1: ran }), now);
    expect([...out.shown.keys()]).toEqual(["a"]);
    expect(out.outdated).toEqual(["b"]);
  });

  it("node mới (không có trong đồ thị của lần chạy) bị bỏ; node không còn trong workflow thì không xuất hiện", () => {
    const ran = graph([node("a"), node("gone")]);
    const now = graph([node("a"), node("fresh")]);
    const out = freshResults([row("a", "r1"), row("gone", "r1"), row("fresh", "r1")], runs({ r1: ran }), now);
    expect([...out.shown.keys()]).toEqual(["a"]);
    expect(out.outdated).toEqual(["fresh"]);
  });

  it("lan xuống phía sau: Ghép phim có tham số y hệt nhưng cảnh nối vào đã đổi thì cũng bỏ; node không dính tới thì giữ", () => {
    const ran = graph([node("s1", { m: "cũ" }), node("s2", { m: "giữ" }), node("combine", { order: ["s1", "s2"] }), node("lone")], [edge("s1", "combine"), edge("s2", "combine")]);
    const now = graph(
      [node("s1", { m: "mới" }), node("s2", { m: "giữ" }), node("combine", { order: ["s1", "s2"] }), node("lone")],
      [edge("s1", "combine"), edge("s2", "combine")],
    );
    const out = freshResults(["s1", "s2", "combine", "lone"].map((id) => row(id, "r1")), runs({ r1: ran }), now);
    expect([...out.shown.keys()].sort()).toEqual(["lone", "s2"]);
    expect(out.outdated.sort()).toEqual(["combine", "s1"]);
  });

  it("lan qua nhiều tầng, kể cả khi dây khai báo ngược thứ tự", () => {
    const ran = graph([node("a", { v: 1 }), node("b"), node("c")], [edge("b", "c"), edge("a", "b")]);
    const now = graph([node("a", { v: 2 }), node("b"), node("c")], [edge("b", "c"), edge("a", "b")]);
    const out = freshResults(["a", "b", "c"].map((id) => row(id, "r1")), runs({ r1: ran }), now);
    expect(out.shown.size).toBe(0);
    expect(out.outdated.sort()).toEqual(["a", "b", "c"]);
  });

  it("node có dây từ một node chưa có kết quả nào thì cũng bỏ", () => {
    const g = graph([node("src"), node("dst")], [edge("src", "dst")]);
    const out = freshResults([row("dst", "r1")], runs({ r1: g }), g);
    expect(out.shown.size).toBe(0);
    expect(out.outdated).toEqual(["dst"]);
  });

  it("dòng 'dùng lại' của lần chạy sau giữ kết quả khi tham số của lần đó khớp, dù lần chạy đầu có tham số khác", () => {
    const first = graph([node("a", { v: 1 })]);
    const later = graph([node("a", { v: 2 })]);
    const now = graph([node("a", { v: 2 })]);
    const out = freshResults([row("a", "r2"), row("a", "r1")], runs({ r1: first, r2: later }), now);
    expect(out.shown.get("a")).toBe("a@r2");
    expect(out.outdated).toEqual([]);
  });

  it("chỉ xét dòng mới nhất của node: dòng mới nhất khác tham số thì bỏ, dù dòng cũ hơn khớp", () => {
    const old = graph([node("a", { v: 1 })]);
    const newer = graph([node("a", { v: 2 })]);
    const now = graph([node("a", { v: 1 })]);
    const out = freshResults([row("a", "r2"), row("a", "r1")], runs({ r1: old, r2: newer }), now);
    expect(out.shown.size).toBe(0);
    expect(out.outdated).toEqual(["a"]);
  });

  it("take tính là tham số: Chạy lại (take mới) chưa xong thì không hiện kết quả của take cũ", () => {
    const ran = graph([node("s", { motion: "đi", take: 1 })]);
    const now = graph([node("s", { motion: "đi", take: 2 })]);
    expect(freshResults([row("s", "r1")], runs({ r1: ran }), now).shown.size).toBe(0);
  });

  it("lần chạy không đọc được đồ thị thì không kiểm chứng được: không hiện gì của nó", () => {
    const now = graph([node("a")]);
    const out = freshResults([row("a", "hong")], new Map(), now);
    expect(out.shown.size).toBe(0);
    expect(out.outdated).toEqual(["a"]);
  });

  it("node chưa từng chạy không nằm trong outdated", () => {
    const out = freshResults([], new Map(), graph([node("a")]));
    expect(out.outdated).toEqual([]);
  });
});

describe("freshResults — nguồn được chạy lại riêng ở lần chạy sau", () => {
  const g = graph([node("s1", { m: "x" }), node("combine", { order: ["s1"] })], [edge("s1", "combine")]);
  const both = runs({ r1: g, r2: g });

  it("cảnh chạy lại riêng ở r2 với khoá mới, Ghép phim vẫn là dòng của r1 → Ghép phim không còn đúng", () => {
    const out = freshResults([row("s1", "r2", "k2"), row("s1", "r1", "k1"), row("combine", "r1", "c1")], both, g);
    expect([...out.shown.keys()]).toEqual(["s1"]);
    expect(out.outdated).toEqual(["combine"]);
  });

  it("dòng của cảnh ở r2 là 'dùng lại' với khoá y hệt khoá r1 đã dùng → Ghép phim được giữ", () => {
    const out = freshResults([row("s1", "r2", "k1", "cached"), row("s1", "r1", "k1"), row("combine", "r1", "c1")], both, g);
    expect([...out.shown.keys()].sort()).toEqual(["combine", "s1"]);
    expect(out.outdated).toEqual([]);
  });

  it("cùng lần chạy thì không so khoá", () => {
    const out = freshResults([row("s1", "r1", "k1"), row("combine", "r1", "c1")], both, g);
    expect(out.outdated).toEqual([]);
  });

  it("dữ liệu cũ không có khoá (lần chạy hiển thị của workflow cũ): cùng lần chạy hoặc dòng 'dùng lại' thì giữ, còn lại bỏ", () => {
    const legacySameRun = freshResults([row("s1", "r1", null, "cached"), row("combine", "r1", null, "cached")], both, g);
    expect(legacySameRun.outdated).toEqual([]);
    // Nguồn là dòng 'dùng lại' ở lần chạy khác, không có khoá: giữ.
    const cached = freshResults([row("s1", "r2", null, "cached"), row("combine", "r1", null, "cached")], both, g);
    expect(cached.outdated).toEqual([]);
    // Nguồn chạy thật ở lần chạy khác mà không có khoá để so: bỏ.
    const ran = freshResults([row("s1", "r2", null, "succeeded"), row("combine", "r1", null, "cached")], both, g);
    expect(ran.outdated).toEqual(["combine"]);
    // Một bên có khoá, một bên không: coi như không biết.
    const mixed = freshResults([row("s1", "r2", "k2", "succeeded"), row("s1", "r1", null), row("combine", "r1", null, "cached")], both, g);
    expect(mixed.outdated).toEqual(["combine"]);
  });

  it("lan tiếp: nguồn mới hơn làm bỏ node ngay sau nó, và các node sau nữa cũng bỏ", () => {
    const chain = graph([node("a"), node("b"), node("c")], [edge("a", "b"), edge("b", "c")]);
    const out = freshResults(
      [row("a", "r2", "k2"), row("a", "r1", "k1"), row("b", "r1", "kb"), row("c", "r1", "kc")],
      runs({ r1: chain, r2: chain }),
      chain,
    );
    expect([...out.shown.keys()]).toEqual(["a"]);
    expect(out.outdated.sort()).toEqual(["b", "c"]);
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
