import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import type { WorkflowGraph } from "../../shared/workflow";
import { getWorkflowRow, saveWorkflowGraph } from "./store";

const graph: WorkflowGraph = { nodes: [{ id: "p1", type: "prompt", position: { x: 0, y: 0 }, params: { text: "a" } }], edges: [] };

describe("saveWorkflowGraph: updatedAt là phiên bản tăng dần", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await env.cleanup();
  });

  it("hai lần lưu trong cùng một mili giây: lần sau có updatedAt lớn hơn lần trước", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const first = saveWorkflowGraph(env.db, "w", graph, "Một");
    const second = saveWorkflowGraph(env.db, "w", graph);
    const third = saveWorkflowGraph(env.db, "w", graph);
    expect(first.updatedAt).toBe(1_800_000_000_000);
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
    expect(third.updatedAt).toBeGreaterThan(second.updatedAt);
    expect(getWorkflowRow(env.db, "w")?.updatedAt).toBe(third.updatedAt);
  });

  it("đồng hồ lùi lại: updatedAt vẫn không giảm", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_005_000);
    const first = saveWorkflowGraph(env.db, "w", graph);
    now.mockReturnValue(1_800_000_000_000);
    expect(saveWorkflowGraph(env.db, "w", graph).updatedAt).toBeGreaterThan(first.updatedAt);
  });

  it("đồng hồ chạy bình thường: lần sau lấy giờ hiện tại", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    saveWorkflowGraph(env.db, "w", graph);
    now.mockReturnValue(1_800_000_009_000);
    expect(saveWorkflowGraph(env.db, "w", graph).updatedAt).toBe(1_800_000_009_000);
  });
});
