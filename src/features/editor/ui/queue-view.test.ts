import { describe, expect, it } from "vitest";
import type { RunNodeState } from "../../../shared/api";
import { queueSummary } from "./queue-view";

const st = (status: RunNodeState["status"], message: string | null = null): RunNodeState => ({ status, message, error: null, output: null });

describe("queueSummary", () => {
  it("đếm xong/tổng chỉ trong các node của lần chạy này (node ngoài phạm vi giữ kết quả cũ không tính)", () => {
    const states = { a: st("succeeded"), b: st("cached"), c: st("running", "Ảnh khung 1/2 (muse_vid_01)"), d: st("pending"), old: st("succeeded") };
    const s = queueSummary(states, ["a", "b", "c", "d"]);
    expect(s).toMatchObject({ done: 2, total: 4, failed: 0, running: ["c"] });
  });

  it("node lỗi hoặc bị bỏ qua không tính là xong; lỗi được đếm riêng", () => {
    const s = queueSummary({ a: st("failed"), b: st("skipped"), c: st("succeeded") }, ["a", "b", "c"]);
    expect(s).toMatchObject({ done: 1, total: 3, failed: 1, running: [] });
  });

  it("chưa có node nào (mới xếp hàng) → 0/0", () => {
    expect(queueSummary({ x: st("succeeded") }, [])).toMatchObject({ done: 0, total: 0, running: [] });
  });
});
