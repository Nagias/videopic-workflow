import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runNodes } from "../../core/db/schema";
import type { Ffmpeg } from "../../core/ffmpeg";
import { executeRun } from "../../core/executor";
import { createChatLocks } from "../../core/run-shared";
import type { ProviderRegistry } from "../../providers/types";
import type { Shot } from "../../shared/director";
import type { PortValue } from "../../shared/ports";
import type { WorkflowGraph, WorkflowNode } from "../../shared/workflow";
import { countingFakeProviders, testNodes } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import type { SceneParams } from "../scene/definition";

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
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string, n = 0) => ({
  id: `${source}-${target}-${targetHandle}-${n}`,
  source,
  sourceHandle,
  target,
  targetHandle,
});
const refEdges = (target: string) => [edge("ch", "character", target, "character"), edge("lo", "location", target, "location")];

describe("node film-combine (Ghép phim)", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const runGraph = async (graph: WorkflowGraph, providers: ProviderRegistry, ffmpeg: Ffmpeg = env.ffmpeg) => {
    const runId = randomUUID();
    const error = await executeRun({ ...env, ffmpeg, providers, nodes: testNodes, chatLocks: createChatLocks() }, runId, "wf", graph, new AbortController().signal, { mode: "all" }).then(
      () => undefined,
      (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
    );
    return { runId, error };
  };
  const rowOf = (runId: string, nodeId: string) => env.db.select().from(runNodes).where(and(eq(runNodes.runId, runId), eq(runNodes.nodeId, nodeId))).get();
  const videoOf = (runId: string, nodeId: string) => {
    const v = (JSON.parse(rowOf(runId, nodeId)!.outputJson!) as Record<string, PortValue>).video;
    return v?.kind === "video" ? v : undefined;
  };

  // Ba cảnh: cắt, nối (Nối tiếp từ cảnh 1), cắt; Ghép phim nhận theo order (không theo toạ độ).
  const sceneGraph = (combine: object, scenes: [string, SceneParams][], extraEdges: WorkflowGraph["edges"] = []): WorkflowGraph => ({
    nodes: [...refNodes(), ...scenes.map(([id, p], i) => node(id, "scene", p, 900 - i * 300)), node("g", "film-combine", combine, 1200)],
    edges: [...scenes.flatMap(([id]) => refEdges(id)), ...scenes.map(([id], i) => edge(id, "clip", "g", "clips", i)), ...extraEdges],
  });

  it("3 clip theo order → 1 phim, thời lượng ≈ tổng", async () => {
    const counter = countingFakeProviders();
    const graph = sceneGraph({ fixBrightness: true, order: ["s1", "s2", "s3"] }, [
      ["s1", scene("s1")],
      ["s2", scene("s2", { size: "CU", start: "" })],
      ["s3", scene("s3", { size: "WS" })],
    ], [edge("s1", "clip", "s2", "follow")]);
    const paths: string[] = [];
    const watched: Ffmpeg = {
      ...env.ffmpeg,
      concatClips: (parts, out) => {
        paths.push(...parts.map((p) => p.path));
        return env.ffmpeg.concatClips(parts, out);
      },
    };
    const { runId, error } = await runGraph(graph, counter.providers, watched);
    expect(error).toBeUndefined();
    expect(counter.calls()).toBe(3);
    expect(rowOf(runId, "g")?.status).toBe("succeeded");
    // Toạ độ xếp s3, s2, s1 (phải sang trái) nhưng order thắng.
    const clipPath = (id: string) => {
      const v = (JSON.parse(rowOf(runId, id)!.outputJson!) as Record<string, PortValue>).clip;
      return env.storage.absPath(env.storage.getMedia(v?.kind === "video" ? v.mediaId : "")!);
    };
    expect(paths).toEqual(["s1", "s2", "s3"].map(clipPath));
    const film = videoOf(runId, "g");
    // 3 × 5 giây, cảnh nối cắt đầu 2 khung hình.
    expect(film?.durationSec).toBeGreaterThan(14.5);
    expect(film?.durationSec).toBeLessThan(15.3);
  });

  it("phim giống hệt film cũ", async () => {
    const counter = countingFakeProviders();
    const p1 = scene("s1");
    const p2 = scene("s2", { size: "CU", start: "" });
    const p3 = scene("s3", { subject: "none", size: "EWS" });
    const film: WorkflowGraph = {
      nodes: [
        ...refNodes(),
        node("sl", "shotlist", { shots: [shotOf("s1", "cut", p1), shotOf("s2", "chain", p2), shotOf("s3", "cut", p3)] }),
        node("f", "film", { provider: "fake", fixBrightness: true }),
      ],
      edges: [...refEdges("f"), edge("sl", "shots", "f", "shots")],
    };
    const r1 = await runGraph(film, counter.providers);
    expect(r1.error).toBeUndefined();
    expect(counter.calls()).toBe(3);
    const filmVideo = videoOf(r1.runId, "f");

    const combined = sceneGraph({ fixBrightness: true, order: ["s1", "s2", "s3"] }, [["s1", p1], ["s2", p2], ["s3", p3]], [edge("s1", "clip", "s2", "follow")]);
    // Đếm lần ghép thật: ffmpeg ra file y hệt thì kho cũng trả cùng mã, nên phải thấy bước ghép là cache hit.
    let concats = 0;
    const counted: Ffmpeg = {
      ...env.ffmpeg,
      concatClips: (parts, out) => {
        concats++;
        return env.ffmpeg.concatClips(parts, out);
      },
    };
    const r2 = await runGraph(combined, counter.providers, counted);
    expect(r2.error).toBeUndefined();
    expect(counter.calls()).toBe(3);
    expect(concats).toBe(0);
    expect(videoOf(r2.runId, "g")?.mediaId).toBe(filmVideo?.mediaId);
  });

  it("preflight: cảnh đầu có follow → lỗi trước khi gọi dịch vụ, calls() = 0, lỗi nêu mã node", async () => {
    const counter = countingFakeProviders();
    // s2 nối tiếp s1 nhưng order đặt s2 lên đầu.
    const graph = sceneGraph({ fixBrightness: true, order: ["s2", "s1"] }, [
      ["s1", scene("s1")],
      ["s2", scene("s2", { start: "" })],
    ], [edge("s1", "clip", "s2", "follow")]);
    const { runId, error } = await runGraph(graph, counter.providers);
    expect(error?.message).toContain("s2");
    expect(error?.message).toMatch(/cảnh đầu tiên không thể "nối"/);
    expect(counter.calls()).toBe(0);
    expect(counter.log.image).toBe(0);
    for (const id of ["ch", "lo", "s1", "s2", "g"]) expect(rowOf(runId, id)?.status).toBe("skipped");
  });

  it("preflight: trạng thái đồ vật không liên tục → lỗi, calls() = 0", async () => {
    const counter = countingFakeProviders();
    const graph = sceneGraph({ fixBrightness: false, order: ["s1", "s2"] }, [
      ["s1", scene("s1", { props: "khúc gỗ: nguyên khúc -> bổ đôi" })],
      ["s2", scene("s2", { size: "INSERT", subject: "hands", props: "khúc gỗ: nguyên khúc" })],
    ], [edge("pr", "props", "s1", "props"), edge("pr", "props", "s2", "props")]);
    graph.nodes.push(node("pr", "props", { items: [{ name: "khúc gỗ", description: "khúc gỗ thông ngắn", states: "nguyên khúc, bổ đôi" }], provider: "fake" }));
    const { runId, error } = await runGraph(graph, counter.providers);
    expect(error?.message).toContain("s2");
    expect(error?.message).toMatch(/đang ở trạng thái "bổ đôi"/);
    expect(counter.calls()).toBe(0);
    expect(counter.log.image).toBe(0);
    expect(rowOf(runId, "pr")?.status).toBe("skipped");
  });

  it("preflight: trạng thái đồ vật không có trong node Đồ vật → lỗi, calls() = 0", async () => {
    const counter = countingFakeProviders();
    const graph = sceneGraph({ fixBrightness: false }, [["s1", scene("s1", { props: "khúc gỗ: cháy đen" })]], [edge("pr", "props", "s1", "props")]);
    graph.nodes.push(node("pr", "props", { items: [{ name: "khúc gỗ", description: "khúc gỗ thông ngắn", states: "nguyên khúc, bổ đôi" }], provider: "fake" }));
    const { error } = await runGraph(graph, counter.providers);
    expect(error?.message).toMatch(/không có trạng thái "cháy đen"/);
    expect(counter.log.image).toBe(0);
  });

  it("preflight: một clip cắm hai lần vào Ghép phim → lỗi nêu tên node, calls() = 0", async () => {
    const counter = countingFakeProviders();
    const graph = sceneGraph({ fixBrightness: true }, [["s1", scene("s1")]], [edge("s1", "clip", "g", "clips", 9)]);
    const { error } = await runGraph(graph, counter.providers);
    expect(error?.message).toMatch(/Ghép phim/);
    expect(error?.message).toContain("s1");
    expect(counter.calls()).toBe(0);
  });

  it("clip không có meta (Tạo video) → dùng nguyên thời lượng thật, không cắt đầu", async () => {
    const counter = countingFakeProviders();
    const graph: WorkflowGraph = {
      nodes: [node("p", "prompt", { text: "rừng nguyên sinh buổi sáng" }), node("v", "generate-video", { provider: "fake", durationSec: 10 }), node("g", "film-combine", { fixBrightness: true })],
      edges: [edge("p", "text", "v", "prompt"), edge("v", "video", "g", "clips")],
    };
    const { runId, error } = await runGraph(graph, counter.providers);
    expect(error).toBeUndefined();
    const clip = (JSON.parse(rowOf(runId, "v")!.outputJson!) as Record<string, PortValue>).video;
    const film = videoOf(runId, "g");
    expect(clip?.kind === "video" && clip.clip).toBeUndefined();
    // Không cắt về 5 giây như clip của Cảnh.
    expect(film?.durationSec).toBeGreaterThan(9.5);
    expect(Math.abs((film?.durationSec ?? 0) - (clip?.kind === "video" ? clip.durationSec : 0))).toBeLessThan(0.15);
  });
});
