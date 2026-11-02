import { describe, expect, it } from "vitest";
import { WorkflowConflictError } from "../../../app/api-client";
import type { WorkflowResponse } from "../../../shared/api";
import { GraphReplacedError, graphWasReplaced, reloadFromServer, type ReloadDeps } from "./reload-graph";

const server: WorkflowResponse = { id: "w", name: "w", graph: { nodes: [], edges: [], groups: [] }, updatedAt: 5 };
const conflict = () => new WorkflowConflictError("Workflow vừa được cập nhật ở nơi khác — đã tải bản mới", server);

// Bộ giả: ghi lại thứ tự gọi để kiểm chặng nào chạy.
function deps(over: Partial<ReloadDeps<string, string>> = {}) {
  const calls: string[] = [];
  const d: ReloadDeps<string, string> = {
    tries: 3,
    flush: () => {
      calls.push("flush");
      return Promise.resolve();
    },
    load: () => {
      calls.push("load");
      return Promise.resolve({ wf: "đồ thị máy chủ", last: "kết quả mới nhất" });
    },
    isShown: () => true,
    isBusy: () => false,
    apply: (wf) => {
      calls.push(`apply:${wf}`);
    },
    ...over,
  };
  return { d, calls };
}

describe("reloadFromServer", () => {
  it("bình thường: lưu, tải, hiện đồ thị, trả kết quả lần chạy", async () => {
    const { d, calls } = deps();
    await expect(reloadFromServer(d)).resolves.toEqual({ kind: "applied", last: "kết quả mới nhất" });
    expect(calls).toEqual(["flush", "load", "apply:đồ thị máy chủ"]);
  });

  it("lưu bị 409 (đồ thị máy chủ đã lên canvas): không phải lỗi, vẫn tải và trả kết quả lần chạy mới nhất", async () => {
    const { d, calls } = deps({ flush: () => Promise.reject(conflict()) });
    await expect(reloadFromServer(d)).resolves.toEqual({ kind: "applied", last: "kết quả mới nhất" });
    expect(calls).toEqual(["load", "apply:đồ thị máy chủ"]);
  });

  it("lần lưu xếp hàng bị bỏ vì canvas đã đổi: cũng coi là đã thay, tiếp tục tải", async () => {
    const { d } = deps({ flush: () => Promise.reject(new GraphReplacedError()) });
    await expect(reloadFromServer(d)).resolves.toMatchObject({ kind: "applied" });
  });

  it("lỗi lưu khác (mạng, 400, 500) vẫn ném lên, không tải gì", async () => {
    const { d, calls } = deps({ flush: () => Promise.reject(new Error("Máy chủ trả lỗi 500")) });
    await expect(reloadFromServer(d)).rejects.toThrow("Máy chủ trả lỗi 500");
    expect(calls).toEqual([]);
  });

  it("đã chuyển sang workflow khác trong lúc tải: bỏ, không hiện đồ thị", async () => {
    const { d, calls } = deps({ isShown: () => false });
    await expect(reloadFromServer(d)).resolves.toEqual({ kind: "stale" });
    expect(calls).not.toContain("apply:đồ thị máy chủ");
  });

  it("vẫn đang sửa: lưu rồi tải lại; hết số lần thì báo busy và không hiện đồ thị", async () => {
    const busy = true;
    const { d, calls } = deps({ isBusy: () => busy });
    await expect(reloadFromServer(d)).resolves.toEqual({ kind: "busy" });
    expect(calls.filter((c) => c === "load")).toHaveLength(3);
    expect(calls.some((c) => c.startsWith("apply"))).toBe(false);

    let n = 0;
    const second = deps({ isBusy: () => ++n < 2 });
    await expect(reloadFromServer(second.d)).resolves.toMatchObject({ kind: "applied" });
    expect(second.calls.filter((c) => c === "flush")).toHaveLength(2);
  });
});

describe("graphWasReplaced", () => {
  it("chỉ nhận 409 và lần lưu bị bỏ vì canvas đã đổi", () => {
    expect(graphWasReplaced(conflict())).toBe(true);
    expect(graphWasReplaced(new GraphReplacedError())).toBe(true);
    expect(graphWasReplaced(new Error("Máy chủ trả lỗi 500"))).toBe(false);
    expect(graphWasReplaced("x")).toBe(false);
  });
});
