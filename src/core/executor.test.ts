import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countingFakeProviders, promptToVideoGraph, testNodes } from "../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../tests/helpers/test-env";
import type { PortValue } from "../shared/ports";
import type { WorkflowGraph } from "../shared/workflow";
import { nodeCache, runNodes } from "./db/schema";
import { cacheKeyOf, executeRun, GraphError, NODE_CANCELLED_MESSAGE, planGraph, stableStringify, type ExecuteDeps } from "./executor";
import { requireInput, requireInputs, type NodeInputs, type NodeRun, type ServerNode } from "./node-runtime";
import { createChatLocks, type RunShared } from "./run-shared";

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
    await executeRun({ ...env, providers, nodes: testNodes, chatLocks: createChatLocks() }, runId, "wf", graph, new AbortController().signal, { mode: "all" });
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
function probeNode(opts: { type: string; label?: string; inputs: { name: string; multiple?: boolean; optional?: boolean }[]; stepScope?: string; run: NodeRun<unknown> }): ServerNode {
  return {
    definition: {
      type: opts.type,
      label: opts.label ?? "Thử",
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
    executeRun({ ...env, providers: countingFakeProviders().providers, nodes: { src: emitter, collect: collector }, chatLocks: createChatLocks() }, randomUUID(), "wf", graph, new AbortController().signal, { mode: "all" });

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
          { ...env, providers: countingFakeProviders().providers, nodes: { stepper }, chatLocks: createChatLocks() },
          randomUUID(),
          "wf",
          { nodes: [{ id: "s", type: "stepper", position: { x: 0, y: 0 }, params: take === undefined ? {} : { take } }], edges: [] },
          new AbortController().signal,
          { mode: "all" },
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

describe("lập lịch chạy song song và phạm vi chạy", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const deps = (nodes: Record<string, ServerNode>): ExecuteDeps => ({ ...env, providers: countingFakeProviders().providers, nodes, chatLocks: createChatLocks() });
  const rowsOf = (runId: string) => new Map(env.db.select().from(runNodes).where(eq(runNodes.runId, runId)).all().map((r) => [r.nodeId, r]));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const pass = probeNode({
    type: "pass",
    inputs: [
      { name: "in", optional: true },
      { name: "extra", optional: true },
    ],
    run: (_ctx, _in, p) => Promise.resolve({ out: { kind: "text", text: (p as { text?: string }).text ?? "x" } }),
  });
  const at = (id: string, type: string, x: number) => ({ id, type, position: { x, y: 0 }, params: { text: id } });

  it("node độc lập chạy song song", async () => {
    let active = 0;
    let peak = 0;
    const shareds: RunShared[] = [];
    const slow = probeNode({
      type: "slow",
      inputs: [],
      run: async (ctx) => {
        shareds.push(ctx.shared);
        active++;
        peak = Math.max(peak, active);
        await sleep(200);
        active--;
        return { out: { kind: "text", text: "ok" } };
      },
    });
    const runId = randomUUID();
    const started = Date.now();
    await executeRun(deps({ slow }), runId, "wf", { nodes: [at("a", "slow", 0), at("b", "slow", 100)], edges: [] }, new AbortController().signal, { mode: "all" });
    const elapsed = Date.now() - started;
    // Bằng chứng chắc chắn: cả hai node cùng đang chạy một lúc. Chạy lần lượt thì ít nhất 400 ms.
    expect(peak).toBe(2);
    expect(elapsed).toBeLessThan(400);
    expect(shareds).toHaveLength(2);
    expect(shareds[0]).toBe(shareds[1]);
    expect([...rowsOf(runId).values()].map((r) => r.status)).toEqual(["succeeded", "succeeded"]);
  });

  it("node lỗi: node phía sau bị skipped, node độc lập vẫn succeeded, run ném lỗi nêu tên node lỗi", async () => {
    const broken = probeNode({ type: "broken", label: "Hỏng", inputs: [], run: () => Promise.reject(new Error("dịch vụ sập")) });
    const slowOk = probeNode({
      type: "slow-ok",
      inputs: [],
      run: async () => {
        await sleep(50);
        return { out: { kind: "text", text: "ok" } };
      },
    });
    const runId = randomUUID();
    const graph: WorkflowGraph = {
      nodes: [at("bad", "broken", 0), at("after", "pass", 100), at("after2", "pass", 200), at("solo", "slow-ok", 300)],
      edges: [wire("bad", "after"), wire("after", "after2")],
    };
    await expect(executeRun(deps({ broken, pass, "slow-ok": slowOk }), runId, "wf", graph, new AbortController().signal, { mode: "all" })).rejects.toThrow(
      /1 node lỗi.*Hỏng.*dịch vụ sập/,
    );
    const rows = rowsOf(runId);
    expect(rows.get("bad")?.status).toBe("failed");
    expect(rows.get("bad")?.error).toBe("dịch vụ sập");
    expect(rows.get("after")?.status).toBe("skipped");
    expect(rows.get("after")?.error).toBe('Bỏ qua vì "Hỏng" lỗi');
    expect(rows.get("after2")?.status).toBe("skipped");
    expect(rows.get("after2")?.error).toBe('Bỏ qua vì "Hỏng" lỗi');
    expect(rows.get("solo")?.status).toBe("succeeded");
  });

  it("hai node giống hệt sẵn sàng cùng lúc: chỉ chạy một lần, node kia dùng lại (cached)", async () => {
    let calls = 0;
    const once = probeNode({
      type: "once",
      inputs: [],
      run: async () => {
        calls++;
        await sleep(30);
        return { out: { kind: "text", text: "kết quả" } };
      },
    });
    const runId = randomUUID();
    const twin = (id: string, x: number) => ({ id, type: "once", position: { x, y: 0 }, params: { same: true } });
    await executeRun(deps({ once }), runId, "wf", { nodes: [twin("t1", 0), twin("t2", 100)], edges: [] }, new AbortController().signal, { mode: "all" });
    expect(calls).toBe(1);
    const rows = rowsOf(runId);
    expect(rows.get("t1")?.status).toBe("succeeded");
    expect(rows.get("t2")).toMatchObject({ status: "cached", message: "Dùng lại kết quả trước", outputJson: rows.get("t1")?.outputJson, cacheKey: rows.get("t1")?.cacheKey });
  });

  it("hai node giống hệt mà node chạy lỗi: node kia bị skipped nêu tên node lỗi, chỉ gọi một lần, run báo 1 node lỗi", async () => {
    let calls = 0;
    const broken = probeNode({
      type: "broken-twin",
      label: "Hỏng",
      inputs: [],
      run: async () => {
        calls++;
        await sleep(10);
        throw new Error("dịch vụ sập");
      },
    });
    const runId = randomUUID();
    const twin = (id: string, x: number) => ({ id, type: "broken-twin", position: { x, y: 0 }, params: {} });
    await expect(
      executeRun(deps({ "broken-twin": broken, pass }), runId, "wf", { nodes: [twin("t1", 0), twin("t2", 100), at("after", "pass", 200)], edges: [wire("t2", "after")] }, new AbortController().signal, { mode: "all" }),
    ).rejects.toThrow(/^1 node lỗi\. Node "Hỏng" lỗi: dịch vụ sập$/);
    expect(calls).toBe(1);
    const rows = rowsOf(runId);
    expect(rows.get("t1")).toMatchObject({ status: "failed", error: "dịch vụ sập" });
    expect(rows.get("t2")).toMatchObject({ status: "skipped", error: 'Bỏ qua vì "Hỏng" lỗi' });
    expect(rows.get("after")).toMatchObject({ status: "skipped", error: 'Bỏ qua vì "Hỏng" lỗi' });
  });

  describe("tên thẻ trong thông báo (12 cảnh không còn cùng tên \"Cảnh\")", () => {
    const sceneLike = (fail: string[]) =>
      probeNode({
        type: "scene-like",
        label: "Cảnh",
        inputs: [],
        run: (_ctx, _in, p) => {
          const id = (p as { text: string }).text;
          return fail.includes(id) ? Promise.reject(new Error("dịch vụ sập")) : Promise.resolve({ out: { kind: "text", text: id } });
        },
      });
    const grouped = (): WorkflowGraph => ({
      nodes: [at("s1", "scene-like", 0), at("s2", "scene-like", 100), at("s3", "scene-like", 200), at("after", "pass", 300)],
      edges: [wire("s3", "after")],
      groups: [{ id: "g1", label: "Phân cảnh", nodeIds: ["s1", "s2", "s3"] }],
    });

    it("cảnh lỗi được gọi \"Cảnh <số>\" trong lỗi của lần chạy và trong lý do bỏ qua của node phía sau", async () => {
      const runId = randomUUID();
      await expect(executeRun(deps({ "scene-like": sceneLike(["s2", "s3"]), pass }), runId, "wf", grouped(), new AbortController().signal, { mode: "all" })).rejects.toThrow(
        /^2 node lỗi\. Node "Cảnh 2" lỗi: dịch vụ sập \| Node "Cảnh 3" lỗi: dịch vụ sập$/,
      );
      const rows = rowsOf(runId);
      expect(rows.get("s1")?.status).toBe("succeeded");
      expect(rows.get("after")).toMatchObject({ status: "skipped", error: 'Bỏ qua vì "Cảnh 3" lỗi' });
    });
  });

  describe("kiểm luật gắn lỗi vào thẻ liên quan", () => {
    it("lỗi của một cảnh hiện ở đúng thẻ cảnh (failed); thẻ khác trong phạm vi bị bỏ qua và nêu tên cảnh; không node nào chạy", async () => {
      let ran = 0;
      const scene = probeNode({
        type: "scene-like",
        label: "Cảnh",
        inputs: [],
        run: () => {
          ran++;
          return Promise.resolve({ out: { kind: "text", text: "x" } });
        },
      });
      const combine = probeNode({ type: "combine-like", label: "Ghép", inputs: [{ name: "in", multiple: true }], run: () => Promise.resolve({ out: { kind: "text", text: "x" } }) });
      combine.definition.preflight = () => [{ nodeId: "s2", message: "nối sai" }, "luật chung"];
      const graph: WorkflowGraph = {
        nodes: [at("s1", "scene-like", 0), at("s2", "scene-like", 100), at("g", "combine-like", 300)],
        edges: [wire("s1", "g"), wire("s2", "g")],
        groups: [{ id: "g1", label: "Phân cảnh", nodeIds: ["s1", "s2"] }],
      };
      const runId = randomUUID();
      await expect(executeRun(deps({ "scene-like": scene, "combine-like": combine }), runId, "wf", graph, new AbortController().signal, { mode: "all" })).rejects.toThrow(
        /Kiểm luật trước khi chạy: 2 lỗi.*nối sai.*luật chung/,
      );
      expect(ran).toBe(0);
      const rows = rowsOf(runId);
      expect(rows.get("s2")).toMatchObject({ status: "failed", error: 'Node "Ghép" (g): nối sai' });
      expect(rows.get("g")).toMatchObject({ status: "failed", error: 'Node "Ghép" (g): luật chung' });
      expect(rows.get("s1")?.status).toBe("skipped");
      expect(rows.get("s1")?.error).toContain('"Cảnh 2"');
      expect(rows.get("s1")?.error).toContain('"Ghép"');
    });
  });

  it("node đang chạy mà lần chạy bị huỷ: thẻ báo tiếng Việt, không hiện lỗi tiếng Anh của AbortError", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const running = new Promise<void>((r) => (started = r));
    const waits = probeNode({
      type: "waits",
      inputs: [],
      run: async (ctx) => {
        started();
        await sleep(30);
        ctx.signal.throwIfAborted();
        return { out: { kind: "text", text: "ok" } };
      },
    });
    const runId = randomUUID();
    const done = executeRun(deps({ waits, pass }), runId, "wf", { nodes: [at("n", "waits", 0), at("after", "pass", 100)], edges: [wire("n", "after")] }, controller.signal, { mode: "all" });
    await running;
    controller.abort();
    await expect(done).rejects.toThrow("Run đã bị dừng");
    const rows = rowsOf(runId);
    expect(rows.get("n")).toMatchObject({ status: "failed", error: NODE_CANCELLED_MESSAGE });
    expect(rows.get("n")?.error).not.toMatch(/aborted/i);
    expect(rows.get("after")).toMatchObject({ status: "skipped" });
  });

  // a → b → c ← x ; d đứng riêng
  const chainGraph: WorkflowGraph = {
    nodes: [at("a", "pass", 0), at("b", "pass", 100), at("c", "pass", 200), at("x", "pass", 100), at("d", "pass", 300)],
    edges: [wire("a", "b"), wire("b", "c"), wire("x", "c", "extra")],
  };

  it("scope node: chỉ node đó và phía trước có dòng run_nodes; node khác không có dòng", async () => {
    const runId = randomUUID();
    await executeRun(deps({ pass }), runId, "wf", chainGraph, new AbortController().signal, { mode: "node", nodeId: "b" });
    const rows = rowsOf(runId);
    expect([...rows.keys()].sort()).toEqual(["a", "b"]);
    expect(rows.get("b")?.status).toBe("succeeded");

    await expect(
      executeRun(deps({ pass }), randomUUID(), "wf", chainGraph, new AbortController().signal, { mode: "node", nodeId: "khong-co" }),
    ).rejects.toThrow(/khong-co/);
  });

  it("scope downstream: node đó và phía sau chạy", async () => {
    const runId = randomUUID();
    await executeRun(deps({ pass }), runId, "wf", chainGraph, new AbortController().signal, { mode: "downstream", nodeId: "b" });
    const rows = rowsOf(runId);
    // b, c phía sau; a, x là nguồn cần cho b và c; d không liên quan.
    expect([...rows.keys()].sort()).toEqual(["a", "b", "c", "x"]);
    for (const r of rows.values()) expect(["succeeded", "cached"]).toContain(r.status);
  });
});
