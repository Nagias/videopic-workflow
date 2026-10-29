import { describe, expect, it } from "vitest";
import type { RunNodeState } from "../../../shared/api";
import type { WorkflowGroup } from "../../../shared/workflow";
import { writersFinished } from "./run-sync";

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
