import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countingFakeProviders, promptToVideoGraph, testNodes } from "../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../tests/helpers/test-env";
import type { PortValue } from "../shared/ports";
import type { WorkflowGraph } from "../shared/workflow";
import { nodeCache, runNodes } from "./db/schema";
import { cacheKeyOf, executeRun, GraphError, planGraph, stableStringify } from "./executor";
import { requireInput, requireInputs, type NodeInputs, type NodeRun, type ServerNode } from "./node-runtime";

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

describe("cacheKeyOf — phiên bản prompt trong code", () => {
  it("cùng tham số nhưng prompt trong code đổi (cacheVersion khác) thì khoá khác; không khai báo thì khoá giữ như cũ", () => {
    const base = cacheKeyOf("film", { a: 1 }, {});
    expect(cacheKeyOf("film", { a: 1 }, {}, undefined)).toBe(base);
    expect(cacheKeyOf("film", { a: 1 }, {}, "v1")).not.toBe(base);
    expect(cacheKeyOf("film", { a: 1 }, {}, "v1")).not.toBe(cacheKeyOf("film", { a: 1 }, {}, "v2"));
  });

  it("node dựng phim, biên kịch, ảnh mẫu khai báo phiên bản theo đúng hàm prompt chúng dùng", async () => {
    const prompts = await import("../shared/prompts");
    const { serverNodes } = await import("../nodes/registry.server");
    expect(serverNodes.film?.definition.cacheVersion).toBe(prompts.codeVersion(prompts.keyframePrompt, prompts.motionPrompt, prompts.textVideoPrompt));
    expect(serverNodes.writer?.definition.cacheVersion).toBe(prompts.codeVersion(prompts.writerPrompt, prompts.repairPrompt));
    for (const t of ["character", "location", "props"]) expect(serverNodes[t]?.definition.cacheVersion, t).toMatch(/^[0-9a-z]+$/);
    expect(prompts.codeVersion(prompts.motionPrompt)).not.toBe(prompts.codeVersion(prompts.textVideoPrompt));
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

// Node thử chỉ sống trong file test này (không đưa vào registry).
const looseParams = { parse: (x: unknown) => x } as never;
function probeNode(opts: { type: string; inputs: { name: string; multiple?: boolean }[]; stepScope?: string; run: NodeRun<unknown> }): ServerNode {
  return {
    definition: {
      type: opts.type,
      label: "Thử",
      description: "",
      inputs: opts.inputs.map((i) => ({ ...i, kind: "text" as const, label: i.name })),
      outputs: [{ name: "out", kind: "text" as const, label: "out" }],
      params: looseParams,
      defaults: {},
      stepScope: opts.stepScope,
    },
    parseParams: (x) => x,
    run: opts.run,
  };
}
const srcNode = (id: string, x: number, y = 0) => ({ id, type: "src", position: { x, y }, params: { text: id } });
const wire = (source: string, target: string, handle = "in") => ({ id: `${source}-${target}`, source, sourceHandle: "out", target, targetHandle: handle });
const emitter = probeNode({
  type: "src",
  inputs: [],
  run: (_ctx, _in, p) => Promise.resolve({ out: { kind: "text", text: (p as { text: string }).text } }),
});

describe("cổng multiple", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const received: string[][] = [];
  const collector = probeNode({
    type: "collect",
    inputs: [{ name: "in", multiple: true }],
    run: (_ctx, inputs) => {
      received.push(requireInputs(inputs, "in", "text").map((v) => v.text));
      return Promise.resolve({ out: { kind: "text", text: "ok" } });
    },
  });
  const graphWith = (order?: string[]): WorkflowGraph => ({
    nodes: [srcNode("a", 100), srcNode("b", 300), srcNode("c", 200), { id: "z", type: "collect", position: { x: 500, y: 0 }, params: order ? { order } : {} }],
    edges: [wire("a", "z"), wire("b", "z"), wire("c", "z")],
  });
  const runWith = (graph: WorkflowGraph) =>
    executeRun({ ...env, providers: countingFakeProviders().providers, nodes: { src: emitter, collect: collector } }, randomUUID(), graph, new AbortController().signal);

  it("cổng multiple nhận 3 dây, node nhận mảng theo params.order", async () => {
    await runWith(graphWith(["c", "a", "b"]));
    expect(received.at(-1)).toEqual(["c", "a", "b"]);
    await runWith(graphWith());
    expect(received.at(-1)).toEqual(["a", "c", "b"]);
  });

  it("planGraph luôn trả inputs dạng mảng, cổng multiple giữ cả 3 dây", () => {
    const planned = planGraph(graphWith(), { src: emitter, collect: collector });
    const z = planned.find((p) => p.node.id === "z");
    expect(planned.find((p) => p.node.id === "a")?.inputs.size).toBe(0);
    expect(z?.inputs.get("in")).toHaveLength(3);
  });

  it("cổng thường vẫn báo lỗi khi có 2 dây", () => {
    const single = probeNode({ type: "collect", inputs: [{ name: "in" }], run: () => Promise.resolve({}) });
    expect(() => planGraph(graphWith(), { src: emitter, collect: single })).toThrow(/có nhiều hơn một dây nối/);
  });

  it("requireInput báo lỗi khi cổng giữ mảng; requireInputs sai kiểu cũng báo lỗi", () => {
    const arr: NodeInputs = { in: [{ kind: "text", text: "a" }, { kind: "text", text: "b" }] };
    expect(() => requireInput(arr, "in", "text")).toThrow(/nhiều dây/);
    const wrong: PortValue[] = [{ kind: "text", text: "a" }, { kind: "shotlist", shots: [] }];
    expect(() => requireInputs({ in: wrong }, "in", "text")).toThrow(/kiểu text/);
  });
});

describe("take (lần tạo) trong khoá cache", () => {
  it("take 1 hoặc không có take: cùng khoá cache; take 2: khoá khác", () => {
    const params = { description: "x", provider: "fake" };
    const base = cacheKeyOf("character", params, {});
    expect(cacheKeyOf("character", { ...params, take: 1 }, {})).toBe(base);
    expect(cacheKeyOf("character", { ...params, take: 2 }, {})).not.toBe(base);
  });

  it("khoá bước con dùng stepScope và thêm take khi > 1", async () => {
    const env = createTestEnv();
    try {
      const stepper = probeNode({
        type: "stepper",
        inputs: [],
        stepScope: "film",
        run: async (ctx) => {
          await ctx.step(["a"], () => Promise.resolve({ v: 1 }));
          return { out: { kind: "text", text: "ok" } };
        },
      });
      const stepKeys = () => env.db.select().from(nodeCache).all().map((r) => r.cacheKey);
      const runTake = (take?: number) =>
        executeRun(
          { ...env, providers: countingFakeProviders().providers, nodes: { stepper } },
          randomUUID(),
          { nodes: [{ id: "s", type: "stepper", position: { x: 0, y: 0 }, params: take === undefined ? {} : { take } }], edges: [] },
          new AbortController().signal,
        );

      await runTake();
      const plain = createHash("sha256").update(`step:film:${stableStringify(["a"])}`).digest("hex");
      expect(stepKeys()).toContain(plain);

      await runTake(2);
      const take2Step = createHash("sha256").update(`step:film:take2:${stableStringify(["a"])}`).digest("hex");
      expect(take2Step).not.toBe(plain);
      expect(stepKeys()).toContain(take2Step);
    } finally {
      await env.cleanup();
    }
  });
});
