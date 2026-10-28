import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countingFakeProviders, promptToVideoGraph, testNodes } from "../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../tests/helpers/test-env";
import type { WorkflowGraph } from "../shared/workflow";
import { runNodes } from "./db/schema";
import { executeRun, GraphError, planGraph } from "./executor";

describe("planGraph — cổng vào không bắt buộc", () => {
  it("cổng optional chưa nối thì không lỗi; cổng bắt buộc chưa nối vẫn lỗi", () => {
    const node = (inputs: { name: string; optional?: boolean }[]) => ({
      definition: {
        type: "t",
        label: "Thử",
        description: "",
        inputs: inputs.map((i) => ({ ...i, kind: "text" as const, label: i.name })),
        outputs: [],
        params: { parse: (x: unknown) => x } as never,
        defaults: {},
      },
      parseParams: (x: unknown) => x,
      run: () => Promise.resolve({}),
    });
    const graph: WorkflowGraph = { nodes: [{ id: "n", type: "t", position: { x: 0, y: 0 }, params: {} }], edges: [] };
    expect(planGraph(graph, { t: node([{ name: "a", optional: true }]) })).toHaveLength(1);
    expect(() => planGraph(graph, { t: node([{ name: "a" }]) })).toThrow(GraphError);
  });
});

describe("executeRun", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const run = async (graph: WorkflowGraph, providers: ReturnType<typeof countingFakeProviders>["providers"]) => {
    const runId = randomUUID();
    await executeRun({ ...env, providers, nodes: testNodes }, runId, graph, new AbortController().signal);
    return runId;
  };
  const nodeRow = (runId: string, nodeId: string) =>
    env.db.select().from(runNodes).where(and(eq(runNodes.runId, runId), eq(runNodes.nodeId, nodeId))).get();

  it("chạy Prompt → Tạo video ra clip thật, chạy lại không đổi gì thì dùng cache, provider chỉ gọi 1 lần", async () => {
    const counter = countingFakeProviders();
    const graph = promptToVideoGraph("Một khu rừng nguyên sinh lúc bình minh");

    const r1 = await run(graph, counter.providers);
    expect(nodeRow(r1, "v1")?.status).toBe("succeeded");
    const out = JSON.parse(nodeRow(r1, "v1")!.outputJson!) as { video: { mediaId: string; durationSec: number } };
    expect(out.video.durationSec).toBeGreaterThan(4.8);
    expect(env.storage.getMedia(out.video.mediaId)).toBeDefined();

    const r2 = await run(graph, counter.providers);
    expect(nodeRow(r2, "v1")?.status).toBe("cached");
    expect(nodeRow(r2, "v1")?.message).toBe("Dùng lại kết quả trước");
    expect(counter.calls()).toBe(1);
  });

  it("đổi prompt thì node video chạy lại", async () => {
    const counter = countingFakeProviders();
    await run(promptToVideoGraph("Cảnh A"), counter.providers);
    await run(promptToVideoGraph("Cảnh B"), counter.providers);
    expect(counter.calls()).toBe(2);
  });

  it("prompt trống bị chặn trước khi gọi provider", async () => {
    const counter = countingFakeProviders();
    await expect(run(promptToVideoGraph("   "), counter.providers)).rejects.toThrow(/Prompt đang trống/);
    expect(counter.calls()).toBe(0);
  });
});

describe("planGraph", () => {
  const base = promptToVideoGraph("x");

  it("phát hiện vòng lặp", () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "a", type: "generate-video", position: { x: 0, y: 0 }, params: { provider: "fake", durationSec: 5 } },
      ],
      edges: [{ id: "e", source: "a", sourceHandle: "video", target: "a", targetHandle: "prompt" }],
    };
    expect(() => planGraph(g, testNodes)).toThrow(GraphError);
  });

  it("nối sai kiểu bị báo rõ", () => {
    const g: WorkflowGraph = {
      nodes: [
        ...base.nodes,
        { id: "v2", type: "generate-video", position: { x: 0, y: 0 }, params: { provider: "fake", durationSec: 5 } },
      ],
      edges: [...base.edges, { id: "e2", source: "v1", sourceHandle: "video", target: "v2", targetHandle: "prompt" }],
    };
    expect(() => planGraph(g, testNodes)).toThrow(/Nối sai kiểu/);
  });

  it("thiếu dây vào, loại node lạ, thời lượng sai đều báo lỗi tiếng Việt", () => {
    expect(() => planGraph({ nodes: [base.nodes[1]!], edges: [] }, testNodes)).toThrow(/chưa nối cổng vào/);
    expect(() => planGraph({ nodes: [{ ...base.nodes[0]!, type: "khong-co" }], edges: [] }, testNodes)).toThrow(/không tồn tại/);
    const bad = { ...base, nodes: [base.nodes[0]!, { ...base.nodes[1]!, params: { provider: "fake", durationSec: 7 } }] };
    expect(() => planGraph(bad, testNodes)).toThrow(/5 hoặc 10 giây/);
  });
});
