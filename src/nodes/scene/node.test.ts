import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runNodes } from "../../core/db/schema";
import { executeRun } from "../../core/executor";
import { createChatLocks } from "../../core/run-shared";
import type { MediaProvider, ProviderRegistry } from "../../providers/types";
import type { Shot } from "../../shared/director";
import type { PortValue } from "../../shared/ports";
import type { WorkflowGraph, WorkflowNode } from "../../shared/workflow";
import { countingFakeProviders, testNodeCtx, testNodes } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { run as runCharacter } from "../character/run";
import { CHAIN_TRIM_SEC, definition as filmDefinition } from "../film/definition";
import { run as runLocation } from "../location/run";
import { definition, type SceneParams } from "./definition";
import { run } from "./run";

const CHARACTER = "an adult Vietnamese woman in her early 20s, plain features";
const LOCATION = "sườn đồi Sơn La có suối đá bên dưới";

const scene = (id: string, over: Partial<SceneParams> = {}): SceneParams => ({
  size: "MS",
  angle: "eye",
  move: "static",
  subject: "character",
  start: `start ${id}`,
  motion: `action ${id}`,
  props: "",
  provider: "fake",
  ...over,
});

const shotOf = (id: string, link: Shot["link"], p: SceneParams): Shot => ({
  id,
  link,
  size: p.size,
  angle: p.angle,
  move: p.move,
  subject: p.subject,
  start: p.start,
  motion: p.motion,
  props: p.props,
});

const node = (id: string, type: string, params: object, x = 0): WorkflowNode => ({ id, type, position: { x, y: 0 }, params: { ...params } });
const refNodes = (): WorkflowNode[] => [
  node("ch", "character", { description: CHARACTER, provider: "fake" }),
  node("lo", "location", { description: LOCATION, provider: "fake" }),
];
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({ id: `${source}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle });
const refEdges = (target: string) => [edge("ch", "character", target, "character"), edge("lo", "location", target, "location")];

describe("node scene (Cảnh)", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const refs = async (providers: ProviderRegistry) => {
    const ctx = testNodeCtx(env, providers);
    const c = await runCharacter(ctx, {}, { description: CHARACTER, provider: "fake" });
    const l = await runLocation(ctx, {}, { description: LOCATION, provider: "fake" });
    return { character: c.character!, location: l.location! } as Record<string, PortValue>;
  };

  const runGraph = async (graph: WorkflowGraph, providers: ProviderRegistry) => {
    const runId = randomUUID();
    await executeRun({ ...env, providers, nodes: testNodes, chatLocks: createChatLocks() }, runId, "wf", graph, new AbortController().signal, { mode: "all" });
    return runId;
  };
  const outputOf = (runId: string, nodeId: string) => {
    const row = env.db.select().from(runNodes).where(and(eq(runNodes.runId, runId), eq(runNodes.nodeId, nodeId))).get();
    return JSON.parse(row!.outputJson!) as Record<string, PortValue>;
  };

  it("cảnh không người không đồ vật → 0 ảnh, 1 video chữ, có frame từ thumb", async () => {
    const counter = countingFakeProviders();
    const base = await refs(counter.providers);
    const before = { image: counter.log.image, video: counter.log.video };
    const out = await run(testNodeCtx(env, counter.providers), base, scene("b", { subject: "none", size: "EWS" }));

    expect(counter.log.image - before.image).toBe(0);
    expect(counter.log.video - before.video).toBe(1);
    expect(counter.log.firstFrames.at(-1)).toBeUndefined();
    expect(counter.log.videoPrompts.at(-1)).toMatch(/^Tạo video 5 giây: start b/);
    const frame = out.frame;
    expect(frame?.kind).toBe("image");
    expect(frame?.kind === "image" && env.storage.getMedia(frame.mediaId)?.source).toBe("thumb");
    const clip = out.clip;
    expect(clip?.kind === "video" && clip.clip?.trimStartSec).toBe(0);
    expect(clip?.kind === "video" && clip.clip?.brightness).toBeDefined();
    const probe = await env.ffmpeg.probeVideo(env.storage.absPath(env.storage.getMedia(clip?.kind === "video" ? clip.mediaId : "")!));
    expect(clip?.kind === "video" && clip.durationSec).toBe(probe.durationSec);
    // Clip giả một màu: khung cuối trùng nội dung với thumb nên kho trả lại cùng bản ghi (sha256), chỉ kiểm có ảnh thật.
    expect(out.last?.kind === "image" && env.storage.getMedia(out.last.mediaId)).toBeTruthy();
  });

  it("cảnh có người → ảnh trong chat nhân vật (imageSessions là threadUrl của character) rồi ảnh→video", async () => {
    const counter = countingFakeProviders();
    const base = await refs(counter.providers);
    const character = base.character?.kind === "imageset" ? base.character : undefined;
    expect(character?.session?.threadUrl).toBeTruthy();
    const before = counter.log.image;
    const out = await run(testNodeCtx(env, counter.providers), base, scene("a"));

    expect(counter.log.image - before).toBe(1);
    expect(counter.log.imageSessions[before]).toBe("continue");
    expect(counter.log.imageThreads[before]).toBe(character?.session?.threadUrl);
    expect(counter.log.video).toBe(1);
    expect(out.frame?.kind === "image" && out.frame.mediaId).toBe(counter.log.firstFrames[0]);
    expect(counter.log.videoPrompts[0]).toContain("Trang phục giữ nguyên suốt clip: an adult Vietnamese woman");
  });

  it("có follow → 0 ảnh, khung đầu là khung cuối clip trước, clip.trimStartSec = CHAIN_TRIM_SEC", async () => {
    const counter = countingFakeProviders();
    const base = await refs(counter.providers);
    const ctx = testNodeCtx(env, counter.providers);
    const first = await run(ctx, base, scene("a"));
    const imagesAfterFirst = counter.log.image;

    const second = await run(ctx, { ...base, follow: first.clip! }, scene("b", { size: "CU", start: "" }));
    expect(counter.log.image).toBe(imagesAfterFirst);
    expect(counter.log.video).toBe(2);
    const frameId = second.frame?.kind === "image" ? second.frame.mediaId : "";
    expect(counter.log.firstFrames[1]).toBe(frameId);
    expect(env.storage.getMedia(frameId)?.source).toBe("last-frame");
    expect(first.last?.kind === "image" && first.last.mediaId).toBe(frameId);
    expect(second.clip?.kind === "video" && second.clip.clip?.trimStartSec).toBe(CHAIN_TRIM_SEC);
    // durationSec là thời lượng thật của file (như mọi video), không trừ phần cắt đầu.
    for (const out of [first, second]) {
      const v = out.clip?.kind === "video" ? out.clip : undefined;
      const probe = await env.ffmpeg.probeVideo(env.storage.absPath(env.storage.getMedia(v!.mediaId)!));
      expect(v?.durationSec).toBe(probe.durationSec);
      expect([v?.width, v?.height]).toEqual([probe.width, probe.height]);
    }
  });

  it("take 2 → gọi lại dịch vụ dù chữ y hệt", async () => {
    const counter = countingFakeProviders();
    const graph = (take?: number): WorkflowGraph => ({
      nodes: [...refNodes(), node("s", "scene", { ...scene("t", { subject: "none" }), ...(take ? { take } : {}) })],
      edges: refEdges("s"),
    });
    await runGraph(graph(), counter.providers);
    expect(counter.calls()).toBe(1);
    await runGraph(graph(1), counter.providers);
    expect(counter.calls()).toBe(1);
    await runGraph(graph(2), counter.providers);
    expect(counter.calls()).toBe(2);
  });

  it("khoá bước con giống film", async () => {
    const counter = countingFakeProviders();
    const p1 = scene("s1");
    const p2 = scene("s2", { size: "CU", start: "" });
    const film: WorkflowGraph = {
      nodes: [...refNodes(), node("sl", "shotlist", { shots: [shotOf("s1", "cut", p1), shotOf("s2", "chain", p2)] }), node("f", "film", { provider: "fake", fixBrightness: true })],
      edges: [...refEdges("f"), edge("sl", "shots", "f", "shots")],
    };
    const r1 = await runGraph(film, counter.providers);
    expect(counter.calls()).toBe(2);
    const imagesAfterFilm = counter.log.image;
    const board = outputOf(r1, "f").storyboard;
    const filmClips = board?.kind === "storyboard" ? board.shots.map((s) => s.clipId) : [];

    const scenes: WorkflowGraph = {
      nodes: [...refNodes(), node("c1", "scene", p1, 300), node("c2", "scene", p2, 600)],
      edges: [...refEdges("c1"), ...refEdges("c2"), edge("c1", "clip", "c2", "follow")],
    };
    const r2 = await runGraph(scenes, counter.providers);
    expect(counter.calls()).toBe(2);
    expect(counter.log.image).toBe(imagesAfterFilm);
    const clipOf = (id: string) => {
      const v = outputOf(r2, id).clip;
      return v?.kind === "video" ? v.mediaId : undefined;
    };
    expect([clipOf("c1"), clipOf("c2")]).toEqual(filmClips);
  });

  it("hai cảnh có người song song không trùng thời gian trong chat", async () => {
    const counter = countingFakeProviders();
    const inner = counter.providers.get("fake");
    const spans: { start: number; end: number }[] = [];
    const timed: MediaProvider = {
      id: inner.id,
      maxParallel: () => 2,
      generateVideo: (req, c) => inner.generateVideo(req, c),
      generateText: (req, c) => inner.generateText(req, c),
      generateImage: async (req, c) => {
        if (!/start (a|b)/.test(req.prompt)) return inner.generateImage(req, c);
        const start = performance.now();
        const img = await inner.generateImage(req, c);
        spans.push({ start, end: performance.now() });
        return img;
      },
    };
    const providers: ProviderRegistry = { get: () => timed };
    const graph: WorkflowGraph = {
      nodes: [...refNodes(), node("a", "scene", scene("a"), 300), node("b", "scene", scene("b", { size: "WS" }), 300)],
      edges: [...refEdges("a"), ...refEdges("b")],
    };
    await runGraph(graph, providers);

    expect(spans).toHaveLength(2);
    const [x, y] = [...spans].sort((p, q) => p.start - q.start);
    expect(y!.start).toBeGreaterThanOrEqual(x!.end);
    expect(counter.log.imageThreads.slice(-2)[0]).toBe(counter.log.imageThreads.slice(-2)[1]);
  });

  it("ước tính lượt: có follow hoặc cảnh cắt không người không đồ vật → 0 ảnh; còn lại 1 ảnh", () => {
    const none = new Set<string>();
    expect(definition.estimate?.(scene("x", { subject: "none" }), none)).toEqual({ image: 0, video: 1, text: 0 });
    expect(definition.estimate?.(scene("x"), new Set(["follow"]))).toEqual({ image: 0, video: 1, text: 0 });
    expect(definition.estimate?.(scene("x"), none)).toEqual({ image: 1, video: 1, text: 0 });
    expect(definition.estimate?.(scene("x", { subject: "none", props: "khúc gỗ: nguyên khúc" }), none)).toEqual({ image: 1, video: 1, text: 0 });
    expect(definition.cacheVersion).toBe(filmDefinition.cacheVersion);
    expect(definition.stepScope).toBe("film");
  });
});

describe("node scene (Cảnh) — sản phẩm ảnh thật", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const KEEP_LOGO = "giữ nguyên chữ và logo in trên sản phẩm";
  const photo = async (colorHex: string): Promise<string> => {
    const out = await env.storage.tmpPath("jpg");
    await env.ffmpeg.makeTestImage({ out, colorHex, width: 400, height: 300 });
    return (await env.storage.importFile(out, { kind: "image", source: "upload", width: 400, height: 300 })).id;
  };
  const setup = async () => {
    const counter = countingFakeProviders();
    const ctx = testNodeCtx(env, counter.providers);
    const c = await runCharacter(ctx, {}, { description: CHARACTER, provider: "fake" });
    const l = await runLocation(ctx, {}, { description: LOCATION, provider: "fake" });
    const [flat, legs, bottle] = [await photo("111111"), await photo("222222"), await photo("333333")];
    const product: PortValue = {
      kind: "props",
      items: [{ name: "Bàn gấp", description: "bàn dã ngoại gấp gọn mặt nhôm xám", images: [{ mediaId: flat, state: "gấp phẳng" }, { mediaId: legs, state: "có chân" }] }],
    };
    const props: PortValue = { kind: "props", items: [{ name: "bình nước", description: "bình giữ nhiệt inox", images: [{ mediaId: bottle, state: "đầy" }, { mediaId: bottle, state: "vơi" }] }] };
    const before = { image: counter.log.image, video: counter.log.video };
    return { counter, ctx, inputs: { character: c.character!, location: l.location! } as Record<string, PortValue>, product, props, flat, bottle, before };
  };

  it("cảnh có sản phẩm → ảnh khung đính kèm ảnh sản phẩm trước đồ phụ (dù đồ phụ đổi trạng thái), prompt ảnh và video giữ logo", async () => {
    const s = await setup();
    const p = definition.params.parse(scene("a", { props: "bình nước: đầy -> vơi\nBàn gấp: gấp phẳng" }));
    await run(s.ctx, { ...s.inputs, product: s.product, props: s.props }, p);
    const refs = s.counter.log.imageRefs.at(-1)!.map((r) => r.mediaId);
    expect(refs.indexOf(s.flat)).toBeGreaterThanOrEqual(0);
    expect(refs.indexOf(s.flat)).toBeLessThan(refs.indexOf(s.bottle));
    expect(s.counter.log.imagePrompts.at(-1)).toContain(KEEP_LOGO);
    expect(s.counter.log.imagePrompts.at(-1)).not.toContain("không chữ, không logo");
    expect(s.counter.log.videoPrompts.at(-1)).toContain(KEEP_LOGO);
  });

  it("cảnh không nhắc sản phẩm dù có cổng Sản phẩm → prompt và khoá y hệt khi không nối (không gọi thêm)", async () => {
    const s = await setup();
    const p = definition.params.parse(scene("b", { props: "bình nước: đầy" }));
    await run(s.ctx, { ...s.inputs, product: s.product, props: s.props }, p);
    const calls = { image: s.counter.log.image, video: s.counter.log.video };
    expect(calls.image - s.before.image).toBe(1);
    expect(s.counter.log.imagePrompts.at(-1)).not.toContain(KEEP_LOGO);
    await run(s.ctx, { ...s.inputs, props: s.props }, p);
    expect({ image: s.counter.log.image, video: s.counter.log.video }).toEqual(calls);
  });

  it("cùng tên món ở node Sản phẩm và node Đồ vật → lỗi nêu tên, không gọi dịch vụ", async () => {
    const s = await setup();
    const clash: PortValue = { kind: "props", items: [{ name: "bàn gấp", description: "bàn khác", images: [{ mediaId: s.bottle, state: "gấp phẳng" }] }] };
    await expect(run(s.ctx, { ...s.inputs, product: s.product, props: clash }, definition.params.parse(scene("c", { props: "Bàn gấp: gấp phẳng" })))).rejects.toThrow(
      'Đồ vật "bàn gấp" có ở cả node Sản phẩm và node Đồ vật',
    );
    expect({ image: s.counter.log.image, video: s.counter.log.video }).toEqual(s.before);
  });

  it("trạng thái sản phẩm không có ảnh → lỗi trước khi gọi dịch vụ", async () => {
    const s = await setup();
    await expect(run(s.ctx, { ...s.inputs, product: s.product }, definition.params.parse(scene("d", { props: "Bàn gấp: gập đôi" })))).rejects.toThrow(/gập đôi/);
    expect({ image: s.counter.log.image, video: s.counter.log.video }).toEqual(s.before);
  });

  it("ước tính và dự đoán dùng sản phẩm như lúc chạy", async () => {
    const s = await setup();
    const p = definition.params.parse(scene("e", { props: "Bàn gấp: gấp phẳng -> có chân" }));
    const steps = new Map<string, unknown>();
    const ran = await run({ ...s.ctx, step: async (k, fn) => { const v = await s.ctx.step(k, fn); steps.set(JSON.stringify(k), v); return v; } }, { ...s.inputs, product: s.product }, p);
    const known = { inputs: { ...s.inputs, product: s.product }, step: (k: unknown) => steps.get(JSON.stringify(k)), media: (id: string) => env.storage.getMedia(id) };
    const connected = new Set(["character", "location", "product"]);
    expect(definition.estimate?.(p, connected, known)).toEqual({ image: 0, video: 0, text: 0 });
    expect(definition.predict?.(p, connected, known)?.clip).toEqual({ ...ran.clip, clip: undefined });
  });
});
