import { describe, expect, it } from "vitest";
import type { RunNodeState } from "../../../shared/api";
import type { WorkflowGroup } from "../../../shared/workflow";
import { paramsSnapshot, staleResultIds, withoutResults, writersFinished } from "./run-sync";

const group = (id: string, writerId?: string): WorkflowGroup => ({
  id,
  label: "Phân cảnh",
  nodeIds: [],
  ...(writerId ? { source: { writerId, resultKey: "", snapshot: "" } } : {}),
});
const node = (status: RunNodeState["status"]): RunNodeState => ({ status, message: null, error: null, output: null });

describe("tải lại đồ thị giữa lần chạy khi Biên kịch xong", () => {
  it("Biên kịch có nhóm, xong (chạy hoặc dùng lại) trong lần chạy: tải lại; chưa xong hoặc lỗi thì chưa", () => {
    const groups = [group("g1", "writer-1"), group("g2", "writer-2"), group("g3", "writer-3"), group("g4", "writer-4")];
    const nodes = { "writer-1": node("succeeded"), "writer-2": node("cached"), "writer-3": node("running"), "writer-4": node("failed") };
    expect(writersFinished(groups, nodes, new Set())).toEqual(["writer-1", "writer-2"]);
  });

  it("mỗi Biên kịch chỉ tải lại một lần mỗi lần chạy; hai nhóm cùng Biên kịch tính một lần", () => {
    const groups = [group("g1", "writer-1"), group("g2", "writer-1")];
    const nodes = { "writer-1": node("succeeded") };
    expect(writersFinished(groups, nodes, new Set())).toEqual(["writer-1"]);
    expect(writersFinished(groups, nodes, new Set(["writer-1"]))).toEqual([]);
  });

  it("nhóm tạo tay (không có nguồn Biên kịch) và Biên kịch không có trong lần chạy thì bỏ qua", () => {
    expect(writersFinished([group("g1")], { "writer-1": node("succeeded") }, new Set())).toEqual([]);
    expect(writersFinished([group("g1", "writer-1")], {}, new Set())).toEqual([]);
  });
});

describe("kết quả cũ của thẻ bị thay sau Tạo thẻ cảnh / Thay / Giữ", () => {
  const n = (id: string, params: Record<string, unknown>) => ({ id, params });

  it("thẻ đổi tham số, và thẻ mới (mã chưa có trước đó), thì bỏ kết quả; thẻ giữ nguyên tham số thì giữ", () => {
    const before = paramsSnapshot([n("s1", { motion: "đi", size: "MS" }), n("s2", { motion: "chạy" })]);
    const after = [n("s1", { motion: "đi", size: "MS" }), n("s2", { motion: "nhảy" }), n("s3", { motion: "mới" })];
    expect(staleResultIds(before, after)).toEqual(["s2", "s3"]);
  });

  it("thứ tự khoá trong tham số không phải là khác biệt", () => {
    const before = paramsSnapshot([n("s1", { a: 1, b: { x: 1, y: 2 } })]);
    expect(staleResultIds(before, [n("s1", { b: { y: 2, x: 1 }, a: 1 })])).toEqual([]);
  });

  it("withoutResults bỏ đúng các node đó khỏi kết quả đang hiện, không đụng node khác, không đổi bản gốc", () => {
    const keep = node("succeeded");
    const states = { s1: keep, s2: node("succeeded"), s3: node("cached") };
    expect(withoutResults(states, ["s2", "s3", "không-có"])).toEqual({ s1: keep });
    expect(states.s2).toBeDefined();
    expect(withoutResults(states, [])).toBe(states);
    expect(withoutResults(states, ["không-có"])).toBe(states);
  });
});
