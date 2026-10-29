import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runNodes, runs } from "../src/core/db/schema";
import type { ServerNode } from "../src/core/node-runtime";
import { createQueue } from "../src/core/queue";
import { fakeTextReply } from "../src/providers/fake/text";
import { AssetListResponseSchema, LatestRunResponseSchema, RunResponseSchema, WorkflowResponseSchema } from "../src/shared/api";
import { expandScenes } from "../src/shared/scenes";
import type { WorkflowGraph } from "../src/shared/workflow";
import { promptToVideoGraph } from "./helpers/nodes";
import { createTestServer, type TestServer } from "./helpers/server";

describe("API luồng 1: lưu → chạy → xem clip", () => {
  let s: TestServer;
  beforeEach(async () => {
    s = await createTestServer();
  });
  afterEach(async () => {
    await s.cleanup();
  });

  const startAndFinish = async () => {
    const start = await s.app.inject({ method: "POST", url: "/api/workflows/default/runs", payload: {} });
    expect(start.statusCode).toBe(202);
    const { runId } = start.json<{ runId: string }>();
    while (await s.deps.queue.processNext());
    const res = await s.app.inject({ method: "GET", url: `/api/runs/${runId}` });
    return RunResponseSchema.parse(res.json());
  };

  it("workflow mặc định có Prompt → Tạo video; chạy xong tải được clip có hỗ trợ tua (Range)", async () => {
    const wf = WorkflowResponseSchema.parse((await s.app.inject({ method: "GET", url: "/api/workflows/default" })).json());
    expect(wf.graph.nodes.map((n) => n.type)).toEqual(["prompt", "generate-video"]);

    const run = await startAndFinish();
    expect(run.status).toBe("succeeded");
    const video = run.nodes["video-1"]?.output?.video;
    expect(video?.kind).toBe("video");

    const media = await s.app.inject({ method: "GET", url: `/api/media/${video?.kind === "video" ? video.mediaId : ""}`, headers: { range: "bytes=0-99" } });
    expect(media.statusCode).toBe(206);
    expect(media.headers["content-type"]).toContain("video/mp4");
    expect(media.rawPayload.length).toBe(100);
  });

  it("chạy lần hai không đổi gì: node video báo dùng lại, dịch vụ chỉ gọi một lần", async () => {
    await s.app.inject({ method: "GET", url: "/api/workflows/default" });
    await startAndFinish();
    const second = await startAndFinish();
    expect(second.nodes["video-1"]?.status).toBe("cached");
    expect(s.calls()).toBe(1);
  });

  it("lưu workflow sai (thiếu nodes) bị từ chối 400 với lỗi tiếng Việt", async () => {
    const res = await s.app.inject({ method: "PUT", url: "/api/workflows/default", payload: { graph: { edges: [] } } });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/Workflow không hợp lệ/);
  });

  it("workflow có prompt trống: run thất bại, báo lỗi ở node, không gọi dịch vụ", async () => {
    const graph = promptToVideoGraph("");
    await s.app.inject({ method: "PUT", url: "/api/workflows/default", payload: { graph } });
    const run = await startAndFinish();
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/Prompt đang trống/);
    expect(s.calls()).toBe(0);
  });

  it("kết quả lần chạy gần nhất: chưa chạy thì rỗng, chạy rồi trả đúng lần mới nhất kèm output; workflow lạ 404", async () => {
    await s.app.inject({ method: "GET", url: "/api/workflows/default" });
    const latest = async () => LatestRunResponseSchema.parse((await s.app.inject({ method: "GET", url: "/api/workflows/default/runs/latest" })).json()).run;
    expect(await latest()).toBeNull();

    await startAndFinish();
    const second = await startAndFinish();
    const got = await latest();
    expect(got?.id).toBe(second.id);
    expect(got?.nodes["video-1"]?.output?.video?.kind).toBe("video");

    expect((await s.app.inject({ method: "GET", url: "/api/workflows/khong-co/runs/latest" })).statusCode).toBe(404);
  });

  it("media và run không tồn tại trả 404", async () => {
    expect((await s.app.inject({ method: "GET", url: "/api/media/khong-co" })).statusCode).toBe(404);
    expect((await s.app.inject({ method: "GET", url: "/api/runs/khong-co" })).statusCode).toBe(404);
  });

  it("tài khoản Muse: trả danh sách hồ sơ (rỗng trong test)", async () => {
    const res = await s.app.inject({ method: "GET", url: "/api/muse/accounts" });
    expect(res.json()).toEqual({ accounts: [] });
  });
});

describe("hàng đợi chạy tiếp sau khi tắt máy giữa chừng", () => {
  let s: TestServer;
  beforeEach(async () => {
    s = await createTestServer();
  });
  afterEach(async () => {
    await s.cleanup();
  });

  it("run kẹt ở 'running' được đưa lại hàng đợi khi khởi động, node đã có cache không gọi lại dịch vụ", async () => {
    const graph = promptToVideoGraph("Rừng nguyên sinh");
    const first = s.deps.queue.enqueue("default", graph);
    while (await s.deps.queue.processNext());
    expect(s.calls()).toBe(1);

    const stuck = s.deps.queue.enqueue("default", graph);
    s.db.update(runs).set({ status: "running" }).where(eq(runs.id, stuck)).run();

    const restarted = createQueue({ db: s.db, storage: s.storage, ffmpeg: s.ffmpeg, providers: s.deps.providers, nodes: s.deps.nodes, chatLocks: s.deps.chatLocks }, { pollMs: 20 });
    restarted.start();
    const deadline = Date.now() + 10_000;
    while (s.db.select().from(runs).where(eq(runs.id, stuck)).get()?.status !== "succeeded" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await restarted.stop();
    expect(s.db.select().from(runs).where(eq(runs.id, stuck)).get()?.status).toBe("succeeded");
    expect(s.db.select().from(runs).where(eq(runs.id, first)).get()?.status).toBe("succeeded");
    expect(s.calls()).toBe(1);
  });
});

describe("phạm vi chạy và huỷ lượt chạy", () => {
  let s: TestServer;
  beforeEach(async () => {
    s = await createTestServer();
  });
  afterEach(async () => {
    await s.cleanup();
  });

  const runRow = (id: string) => s.db.select().from(runs).where(eq(runs.id, id)).get();
  const nodeIdsOf = (id: string) => s.db.select().from(runNodes).where(eq(runNodes.runId, id)).all().map((r) => r.nodeId).sort();

  it("run mở lại sau khi tắt máy dùng lại phạm vi đã lưu", async () => {
    const stuck = s.deps.queue.enqueue("default", promptToVideoGraph("Rừng"), { mode: "node", nodeId: "p1" });
    expect(JSON.parse(runRow(stuck)!.scopeJson!)).toEqual({ mode: "node", nodeId: "p1" });
    s.db.update(runs).set({ status: "running" }).where(eq(runs.id, stuck)).run();

    const restarted = createQueue({ db: s.db, storage: s.storage, ffmpeg: s.ffmpeg, providers: s.deps.providers, nodes: s.deps.nodes, chatLocks: s.deps.chatLocks }, { pollMs: 20 });
    restarted.start();
    const deadline = Date.now() + 10_000;
    while (runRow(stuck)?.status !== "succeeded" && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    await restarted.stop();
    expect(runRow(stuck)?.status).toBe("succeeded");
    expect(nodeIdsOf(stuck)).toEqual(["p1"]);
    expect(s.calls()).toBe(0);
  });

  it("huỷ run đang xếp hàng → failed, error 'Đã huỷ'", async () => {
    const runId = s.deps.queue.enqueue("default", promptToVideoGraph("Rừng"));
    expect(s.deps.queue.cancel(runId)).toBe("cancelled");
    expect(runRow(runId)).toMatchObject({ status: "failed", error: "Đã huỷ" });
    expect(runRow(runId)?.finishedAt).toBeTypeOf("number");
    expect(await s.deps.queue.processNext()).toBe(false);
    expect(s.calls()).toBe(0);
    expect(s.deps.queue.cancel(runId)).toBe("finished");
    expect(s.deps.queue.cancel("khong-co")).toBe("not_found");
  });

  it("huỷ run đang chạy → signal bị huỷ, run failed 'Đã huỷ'", async () => {
    let markStarted!: () => void;
    const started = new Promise<void>((r) => (markStarted = r));
    let aborted = false;
    const waiter: ServerNode = {
      definition: { type: "waiter", label: "Chờ", description: "", inputs: [], outputs: [], params: { parse: (x: unknown) => x } as never, defaults: {} },
      parseParams: (x) => x,
      run: (ctx) =>
        new Promise((_resolve, reject) => {
          ctx.signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("node thấy tín hiệu huỷ"));
            },
            { once: true },
          );
          markStarted();
        }),
    };
    const queue = createQueue({ db: s.db, storage: s.storage, ffmpeg: s.ffmpeg, providers: s.deps.providers, nodes: { waiter }, chatLocks: s.deps.chatLocks });
    const runId = queue.enqueue("default", { nodes: [{ id: "w", type: "waiter", position: { x: 0, y: 0 }, params: {} }], edges: [] });
    const processing = queue.processNext();
    await started;
    expect(runRow(runId)?.status).toBe("running");
    expect(queue.cancel(runId)).toBe("cancelled");
    expect(await processing).toBe(true);
    expect(aborted).toBe(true);
    expect(runRow(runId)).toMatchObject({ status: "failed", error: "Đã huỷ" });
    expect(queue.cancel(runId)).toBe("finished");
  });
});

describe("API mẫu workflow", () => {
  let s: TestServer;
  beforeEach(async () => {
    s = await createTestServer();
  });
  afterEach(async () => {
    await s.cleanup();
  });

  it("tạo từ mẫu Sơn La: 5 node (có Đồ vật), 12 cảnh, có trong danh sách; mẫu lạ trả 404", async () => {
    const res = await s.app.inject({ method: "POST", url: "/api/workflows/from-template/sinh-ton-son-la", payload: {} });
    expect(res.statusCode).toBe(201);
    const wf = WorkflowResponseSchema.parse(res.json());
    expect(wf.graph.nodes.map((n) => n.type)).toEqual(["character", "location", "props", "shotlist", "film"]);
    expect((wf.graph.nodes[3]!.params.shots as unknown[]).length).toBe(12);
    const list = (await s.app.inject({ method: "GET", url: "/api/workflows" })).json<{ workflows: { id: string }[] }>();
    expect(list.workflows.map((w) => w.id)).toContain(wf.id);
    expect((await s.app.inject({ method: "GET", url: `/api/workflows/${wf.id}` })).statusCode).toBe(200);
    expect((await s.app.inject({ method: "POST", url: "/api/workflows/from-template/khong-co", payload: {} })).statusCode).toBe(404);
  });

  it("mọi mẫu đi qua kiểm đồ thị; cảnh Sơn La qua luật đạo diễn với đúng danh sách đồ vật, không cảnh báo", async () => {
    const { planGraph } = await import("../src/core/executor");
    const { WORKFLOW_TEMPLATES } = await import("../src/shared/templates");
    const { checkShotList, ShotSchema } = await import("../src/shared/director");
    const { rowsToSpec } = await import("../src/nodes/props/definition");
    for (const t of WORKFLOW_TEMPLATES) expect(() => planGraph(t.graph, s.deps.nodes), t.id).not.toThrow();
    const sonLa = WORKFLOW_TEMPLATES.find((t) => t.id === "sinh-ton-son-la")!.graph;
    const items = rowsToSpec(sonLa.nodes.find((n) => n.type === "props")!.params.items as never);
    const shots = ShotSchema.array().parse(sonLa.nodes.find((n) => n.type === "shotlist")!.params.shots);
    expect(checkShotList(shots, items.map((i) => ({ name: i.name, states: i.states })))).toEqual({ errors: [], warnings: [] });
    expect(WORKFLOW_TEMPLATES.map((t) => t.id)).toContain("y-tuong-thanh-phim");
  });
});

describe("API kho tài sản dùng chung", () => {
  let s: TestServer;
  beforeEach(async () => {
    s = await createTestServer();
  });
  afterEach(async () => {
    await s.cleanup();
  });

  const characterGraph = (description: string, name?: string) => ({
    nodes: [{ id: "c", type: "character", position: { x: 0, y: 0 }, params: { name, description, provider: "fake" } }],
    edges: [],
  });
  const runWorkflow = async (id: string, graph: unknown) => {
    expect((await s.app.inject({ method: "PUT", url: `/api/workflows/${id}`, payload: { graph } })).statusCode).toBe(200);
    const start = await s.app.inject({ method: "POST", url: `/api/workflows/${id}/runs`, payload: {} });
    while (await s.deps.queue.processNext());
    return RunResponseSchema.parse((await s.app.inject({ method: "GET", url: `/api/runs/${start.json<{ runId: string }>().runId}` })).json());
  };

  it("node ảnh mẫu chạy xong thì vào kho; workflow khác dùng lại đúng tham số thì không gọi dịch vụ", async () => {
    const desc = "một cô gái Việt Nam 20 tuổi, tóc buộc đuôi ngựa, áo thể thao màu than";
    expect((await runWorkflow("wf-a", characterGraph(desc, "Cô gái Sơn La"))).status).toBe("succeeded");
    const list = AssetListResponseSchema.parse((await s.app.inject({ method: "GET", url: "/api/assets?kind=character" })).json());
    expect(list.assets).toHaveLength(1);
    expect(list.assets[0]).toMatchObject({ kind: "character", name: "Cô gái Sơn La", params: { description: desc } });
    expect(list.assets[0]?.thumbnailMediaId).toBeTruthy();
    const empty = AssetListResponseSchema.parse((await s.app.inject({ method: "GET", url: "/api/assets?kind=props" })).json());
    expect(empty.assets).toEqual([]);

    const callsBefore = s.imageCalls();
    const reused = await runWorkflow("wf-b", characterGraph(desc, "Cô gái Sơn La"));
    expect(reused.nodes.c?.status).toBe("cached");
    expect(s.imageCalls()).toBe(callsBefore);
  });

  it("kind lạ trả 400", async () => {
    expect((await s.app.inject({ method: "GET", url: "/api/assets?kind=xyz" })).statusCode).toBe(400);
  });
});

describe("API nhóm Phân cảnh: Biên kịch sinh cảnh, tự tạo lại, hỏi khi đã sửa tay", () => {
  const IDEA_A = "Cô gái đi bộ một mình vào rừng nguyên sinh, tìm thấy thác nước nhỏ rồi nhóm bếp đá đun nước.";
  const IDEA_B = "Cô gái đi bộ một mình vào rừng nguyên sinh, tìm thấy thác nước nhỏ rồi ngồi nghỉ ngắm thác.";
  const WF = "y-tuong";
  const EDITED_MESSAGE = "Biên kịch ra bộ cảnh mới nhưng thẻ cảnh đã được sửa tay — chọn Thay hoặc Giữ";

  let s: TestServer;
  // Số lần gọi video lúc Biên kịch được hỏi (để biết cảnh nào đã chạy trước Biên kịch chưa).
  let videoAtWriter: number[];
  // Giữ câu trả lời Biên kịch lại: `hold()` trả lời hứa xong khi Biên kịch đã được hỏi, và hàm thả ra.
  let gate: { asked: () => void; release: Promise<void> } | undefined;
  const hold = () => {
    let release!: () => void;
    const asked = new Promise<void>((r) => (gate = { asked: r, release: new Promise<void>((done) => (release = done)) }));
    return { asked, release: () => release() };
  };
  beforeEach(async () => {
    videoAtWriter = [];
    gate = undefined;
    s = await createTestServer({
      textGate: async () => {
        if (!gate) return;
        gate.asked();
        await gate.release;
      },
      // Kịch bản giả như dịch vụ giả, riêng ý tưởng B đổi chữ cảnh 4: chỉ cảnh đó phải tạo lại.
      textReply: (prompt) => {
        videoAtWriter.push(s.log.video);
        const reply = fakeTextReply(prompt);
        return prompt.includes("ngồi nghỉ ngắm thác") ? reply.replace("việc xảy ra ở cảnh 4", "cô ngồi nghỉ trên tảng đá ngắm thác") : reply;
      },
    });
  });
  afterEach(async () => {
    await s.cleanup();
  });

  // Đồ thị kiểu mới: Nhân vật + Bối cảnh → Biên kịch → Đồ vật, cùng một nhóm Phân cảnh rỗng (chưa có kết quả) và Ghép phim.
  const ideaGraph = (idea: string): WorkflowGraph => {
    const base: WorkflowGraph = {
      nodes: [
        { id: "character-1", type: "character", position: { x: 40, y: 40 }, params: { description: "một cô gái Việt Nam 22 tuổi, tóc buộc đuôi ngựa, áo thể thao xám", provider: "fake" } },
        { id: "location-1", type: "location", position: { x: 40, y: 640 }, params: { description: "rừng nguyên sinh có thác nước nhỏ đổ xuống vũng nước trong", provider: "fake" } },
        { id: "writer-1", type: "writer", position: { x: 480, y: 40 }, params: { idea, shotCount: 4, provider: "fake" } },
        { id: "props-1", type: "props", position: { x: 480, y: 760 }, params: { name: "", items: [], provider: "fake" } },
      ],
      edges: [
        { id: "e-char-writer", source: "character-1", sourceHandle: "character", target: "writer-1", targetHandle: "character" },
        { id: "e-loc-writer", source: "location-1", sourceHandle: "location", target: "writer-1", targetHandle: "location" },
        { id: "e-writer-props", source: "writer-1", sourceHandle: "props", target: "props-1", targetHandle: "spec" },
      ],
    };
    return expandScenes(base, { writerId: "writer-1", shots: [], refs: { character: "character-1", location: "location-1", props: "props-1" }, provider: "fake", origin: { x: 900, y: 40 } }).graph;
  };

  const getWorkflow = async () => WorkflowResponseSchema.parse((await s.app.inject({ method: "GET", url: `/api/workflows/${WF}` })).json());
  const save = async (graph: WorkflowGraph) => expect((await s.app.inject({ method: "PUT", url: `/api/workflows/${WF}`, payload: { graph } })).statusCode).toBe(200);
  const run = async () => {
    const start = await s.app.inject({ method: "POST", url: `/api/workflows/${WF}/runs`, payload: {} });
    expect(start.statusCode).toBe(202);
    while (await s.deps.queue.processNext());
    return RunResponseSchema.parse((await s.app.inject({ method: "GET", url: `/api/runs/${start.json<{ runId: string }>().runId}` })).json());
  };
  const writerKey = (runId: string) => s.db.select().from(runNodes).where(eq(runNodes.runId, runId)).all().find((r) => r.nodeId === "writer-1")!.cacheKey;
  const group = (graph: WorkflowGraph) => graph.groups![0]!;
  const sceneIds = (graph: WorkflowGraph) => group(graph).nodeIds;
  const setParam = (graph: WorkflowGraph, id: string, key: string, value: unknown): WorkflowGraph => ({
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n)),
  });

  it("chạy lần đầu: Biên kịch xong rồi mới có cảnh chạy, ra phim", async () => {
    await save(ideaGraph(IDEA_A));
    const first = await run();
    expect(first.status, first.error ?? "").toBe("succeeded");
    expect(videoAtWriter).toEqual([0]);

    const wf = await getWorkflow();
    const ids = sceneIds(wf.graph);
    expect(ids).toHaveLength(4);
    expect(wf.graph.nodes.filter((n) => ids.includes(n.id)).every((n) => n.type === "scene")).toBe(true);
    expect(group(wf.graph).source).toMatchObject({ writerId: "writer-1", resultKey: writerKey(first.id) });
    for (const id of ids) expect(first.nodes[id]?.status, id).toBe("succeeded");
    const combine = wf.graph.nodes.find((n) => n.type === "film-combine")!;
    expect(combine.params.order).toEqual(ids);
    expect(first.nodes[combine.id]?.output?.video?.kind).toBe("video");
    expect(s.log.video).toBe(4);
    // Run lưu đúng đồ thị mới: mở lại sau khi tắt máy thì chạy tiếp đúng các cảnh này.
    expect(JSON.parse(s.db.select().from(runs).where(eq(runs.id, first.id)).get()!.graphJson)).toEqual(wf.graph);
  });

  it("đổi ý tưởng, chạy lại: nhóm tự tạo lại, cảnh chữ không đổi thì cached", async () => {
    await save(ideaGraph(IDEA_A));
    const first = await run();
    expect(first.status, first.error ?? "").toBe("succeeded");
    const before = await getWorkflow();
    const ids = sceneIds(before.graph);

    await save(setParam(before.graph, "writer-1", "idea", IDEA_B));
    const videoBefore = s.log.video;
    const imageBefore = s.log.image;
    const second = await run();
    expect(second.status, second.error ?? "").toBe("succeeded");
    const after = await getWorkflow();
    expect(sceneIds(after.graph)).toEqual(ids);
    expect(group(after.graph).source?.resultKey).toBe(writerKey(second.id));
    expect(after.graph.nodes.find((n) => n.id === ids[3])!.params.motion).toBe("cô ngồi nghỉ trên tảng đá ngắm thác");
    // Đồ vật lấy danh sách từ Biên kịch nên khoá node Đồ vật, rồi khoá các Cảnh, đổi theo khoá Biên kịch (khoá cache nối chuỗi
    // theo khoá nguồn): cảnh không đổi chữ vẫn chạy lại nhưng mọi bước con (ảnh khung, clip) trúng cache, không tốn lượt.
    // Chỉ cảnh 4 (đổi chuyển động) gọi dịch vụ: 1 video; ảnh khung dùng lại vì khung đầu không đổi.
    expect(s.log.video - videoBefore).toBe(1);
    expect(s.log.image - imageBefore).toBe(0);
    expect(s.log.videoPrompts.at(-1)).toContain("cô ngồi nghỉ trên tảng đá ngắm thác");

    // Biên kịch dùng lại cache (về ý tưởng A) nhưng khác kết quả nhóm đang giữ: vẫn tạo lại nhóm, mọi cảnh trúng cache.
    await save(setParam(after.graph, "writer-1", "idea", IDEA_A));
    const third = await run();
    expect(third.status, third.error ?? "").toBe("succeeded");
    expect(third.nodes["writer-1"]?.status).toBe("cached");
    const back = await getWorkflow();
    expect(group(back.graph).source?.resultKey).toBe(writerKey(first.id));
    expect(back.graph.nodes.find((n) => n.id === ids[3])!.params.motion).toBe("việc xảy ra ở cảnh 4");
    expect(ids.map((id) => third.nodes[id]?.status)).toEqual(["cached", "cached", "cached", "cached"]);
    expect(s.log.video - videoBefore).toBe(1);
    expect(s.log.image - imageBefore).toBe(0);
  });

  const editedThenRun = async () => {
    await save(ideaGraph(IDEA_A));
    expect((await run()).status).toBe("succeeded");
    const wf = await getWorkflow();
    const ids = sceneIds(wf.graph);
    // Sửa tay chữ cảnh 2 rồi đổi ý tưởng.
    await save(setParam(setParam(wf.graph, ids[1]!, "motion", "cô đặt rìu xuống, lau mồ hôi"), "writer-1", "idea", IDEA_B));
    const counts = { video: s.log.video, image: s.log.image, text: s.log.text };
    const blocked = await run();
    return { ids, counts, blocked };
  };

  it("đã sửa tay một cảnh, đổi ý tưởng, chạy: run failed có decision scenes-edited, số lần gọi video/ảnh = 0", async () => {
    const { ids, counts, blocked } = await editedThenRun();
    expect(blocked.status).toBe("failed");
    expect(blocked.error).toContain(EDITED_MESSAGE);
    const wf = await getWorkflow();
    expect(blocked.decision).toEqual({ kind: "scenes-edited", writerId: "writer-1", groupId: group(wf.graph).id });
    expect(s.log.video - counts.video).toBe(0);
    expect(s.log.image - counts.image).toBe(0);
    expect(s.log.text - counts.text).toBe(1);
    expect(blocked.nodes["writer-1"]?.status).toBe("succeeded");
    const combineId = wf.graph.nodes.find((n) => n.type === "film-combine")!.id;
    for (const id of [...ids, combineId]) expect(blocked.nodes[id]?.status, id).toBe("skipped");
    // Thẻ đã sửa không bị thay khi chưa có câu trả lời.
    expect(wf.graph.nodes.find((n) => n.id === ids[1])!.params.motion).toBe("cô đặt rìu xuống, lau mồ hôi");
    expect(wf.graph.nodes.find((n) => n.id === ids[3])!.params.motion).toBe("việc xảy ra ở cảnh 4");
  });

  it("POST scenes choice keep rồi chạy: dùng thẻ đã sửa", async () => {
    const { ids, blocked } = await editedThenRun();
    expect(blocked.status).toBe("failed");

    const kept = await s.app.inject({ method: "POST", url: `/api/workflows/${WF}/scenes`, payload: { writerId: "writer-1", choice: "keep" } });
    expect(kept.statusCode).toBe(200);
    const wf = WorkflowResponseSchema.parse(kept.json());
    expect(group(wf.graph).source?.resultKey).toBe(writerKey(blocked.id));
    expect(wf.graph.nodes.find((n) => n.id === ids[1])!.params.motion).toBe("cô đặt rìu xuống, lau mồ hôi");

    const videoBefore = s.log.video;
    const next = await run();
    expect(next.status, next.error ?? "").toBe("succeeded");
    expect(next.decision).toBeNull();
    expect(next.nodes["writer-1"]?.status).toBe("cached");
    expect(next.nodes[ids[1]!]?.status).toBe("succeeded");
    expect(s.log.video - videoBefore).toBe(1);
    expect(s.log.videoPrompts.at(-1)).toContain("cô đặt rìu xuống, lau mồ hôi");

    // "Giữ" không phải là tạo lại: thẻ vẫn tính là đã sửa tay, đổi ý tưởng lần nữa thì lại dừng hỏi, không tốn lượt.
    const keptWf = await getWorkflow();
    await save(setParam(keptWf.graph, "writer-1", "idea", IDEA_A));
    const counts = { video: s.log.video, image: s.log.image };
    const again = await run();
    expect(again.status).toBe("failed");
    expect(again.decision).toEqual({ kind: "scenes-edited", writerId: "writer-1", groupId: group(keptWf.graph).id });
    expect(s.log.video - counts.video).toBe(0);
    expect(s.log.image - counts.image).toBe(0);
    expect((await getWorkflow()).graph.nodes.find((n) => n.id === ids[1])!.params.motion).toBe("cô đặt rìu xuống, lau mồ hôi");

    // Thay (mặc định): bỏ bản sửa tay, nhóm theo kết quả Biên kịch mới nhất (ý tưởng A).
    const replaced = WorkflowResponseSchema.parse((await s.app.inject({ method: "POST", url: `/api/workflows/${WF}/scenes`, payload: { writerId: "writer-1" } })).json());
    expect(sceneIds(replaced.graph)).toEqual(ids);
    expect(replaced.graph.nodes.find((n) => n.id === ids[1])!.params.motion).not.toBe("cô đặt rìu xuống, lau mồ hôi");
    expect(replaced.graph.nodes.find((n) => n.id === ids[3])!.params.motion).toBe("việc xảy ra ở cảnh 4");
    expect(group(replaced.graph).source?.resultKey).toBe(writerKey(again.id));
  });

  // Bấm Chạy rồi, trong lúc Biên kịch đang viết thì sửa workflow (Editor tự lưu); thả Biên kịch ra cho run chạy hết.
  const runWhileEditing = async (edit: (graph: WorkflowGraph) => WorkflowGraph) => {
    const { asked, release } = hold();
    const start = await s.app.inject({ method: "POST", url: `/api/workflows/${WF}/runs`, payload: {} });
    const processing = (async () => {
      while (await s.deps.queue.processNext());
    })();
    await asked;
    await save(edit((await getWorkflow()).graph));
    release();
    await processing;
    return RunResponseSchema.parse((await s.app.inject({ method: "GET", url: `/api/runs/${start.json<{ runId: string }>().runId}` })).json());
  };
  const extraPrompt = (graph: WorkflowGraph): WorkflowGraph => ({
    ...graph,
    nodes: [...graph.nodes, { id: "ghi-chu", type: "prompt", position: { x: 0, y: 2000 }, params: { text: "ghi chú thêm trong lúc chạy" } }],
  });

  it("sửa node khác trong lúc Biên kịch đang viết: workflow giữ cả sửa đổi đó lẫn nhóm cảnh mới", async () => {
    await save(ideaGraph(IDEA_A));
    const done = await runWhileEditing(extraPrompt);
    expect(done.status, done.error ?? "").toBe("succeeded");
    const wf = await getWorkflow();
    expect(wf.graph.nodes.find((n) => n.id === "ghi-chu")?.params.text).toBe("ghi chú thêm trong lúc chạy");
    const ids = sceneIds(wf.graph);
    expect(ids).toHaveLength(4);
    expect(group(wf.graph).source?.resultKey).toBe(writerKey(done.id));
    for (const id of ids) expect(done.nodes[id]?.status, id).toBe("succeeded");
    // Đồ thị của run là đồ thị lúc bấm Chạy cộng nhóm mới (không có node thêm sau).
    const runGraph = JSON.parse(s.db.select().from(runs).where(eq(runs.id, done.id)).get()!.graphJson) as WorkflowGraph;
    expect(runGraph.nodes.some((n) => n.id === "ghi-chu")).toBe(false);
    expect(runGraph.groups![0]!.nodeIds).toEqual(ids);
  });

  it("sửa tay thẻ cảnh trong lúc Biên kịch đang viết: dừng hỏi, không ghi đè bản sửa, 0 video", async () => {
    await save(ideaGraph(IDEA_A));
    expect((await run()).status).toBe("succeeded");
    const before = await getWorkflow();
    const ids = sceneIds(before.graph);
    await save(setParam(before.graph, "writer-1", "idea", IDEA_B));
    const videoBefore = s.log.video;
    const blocked = await runWhileEditing((g) => setParam(g, ids[0]!, "motion", "flycam bay vòng quanh thác"));
    expect(blocked.status).toBe("failed");
    expect(blocked.error).toContain(EDITED_MESSAGE);
    expect(blocked.decision).toEqual({ kind: "scenes-edited", writerId: "writer-1", groupId: group(before.graph).id });
    expect(s.log.video - videoBefore).toBe(0);
    const wf = await getWorkflow();
    expect(wf.graph.nodes.find((n) => n.id === ids[0])!.params.motion).toBe("flycam bay vòng quanh thác");
    expect(wf.graph.nodes.find((n) => n.id === ids[3])!.params.motion).toBe("việc xảy ra ở cảnh 4");
  });

  it("cảnh cũ của nhóm sai luật nhưng Biên kịch sẽ tạo lại: không chặn từ đầu, tạo lại rồi chạy xong", async () => {
    // Nhóm cũ: cảnh 2 "nối" từ cảnh 1 nhưng khác chủ thể → Ghép phim báo lỗi nếu kiểm ngay lúc bấm Chạy.
    const base = ideaGraph(IDEA_A);
    const cut = { id: "c01", size: "EWS", angle: "aerial", move: "drone", subject: "none", link: "cut", start: "thác nước nhỏ trong rừng", motion: "sương trôi qua thác", props: "" } as const;
    const chain = { ...cut, id: "c02", size: "MS", angle: "eye", move: "static", subject: "character", link: "chain", start: "", motion: "cô gái bước tới mép nước" } as const;
    const stale = expandScenes(base, {
      writerId: "writer-1",
      groupId: group(base).id,
      shots: [cut, chain],
      refs: { character: "character-1", location: "location-1", props: "props-1" },
      provider: "fake",
      resultKey: "ket-qua-cu",
      origin: { x: 900, y: 40 },
    }).graph;
    await save(stale);
    const done = await run();
    expect(done.status, done.error ?? "").toBe("succeeded");
    const wf = await getWorkflow();
    expect(sceneIds(wf.graph)).toHaveLength(4);
    expect(wf.graph.edges.some((e) => e.targetHandle === "follow")).toBe(false);
    expect(s.log.video).toBe(4);
  });

  it("bộ cảnh mới không qua kiểm luật Ghép phim: không cảnh nào được chạy, video = 0, không lưu gì", async () => {
    // Nhóm cũ cắm vào node Đồ vật gõ tay chỉ có "lều"; Biên kịch (giả) viết cảnh dùng "khúc gỗ" → Ghép phim chặn trước khi chạy.
    const base = ideaGraph(IDEA_A);
    const graph: WorkflowGraph = {
      ...base,
      nodes: [...base.nodes, { id: "props-tay", type: "props", position: { x: 40, y: 1140 }, params: { name: "", items: [{ name: "lều", description: "lều mái vòm nhỏ màu xanh rêu", states: "dựng trên bãi cỏ" }], provider: "fake" } }],
    };
    const shot = { id: "c01", size: "EWS", angle: "aerial", move: "drone", subject: "none", link: "cut", start: "bãi cỏ nhỏ có lều xanh", motion: "sương trôi chậm qua bãi cỏ", props: "lều: dựng trên bãi cỏ" } as const;
    const stale = expandScenes(graph, {
      writerId: "writer-1",
      groupId: group(base).id,
      shots: [shot],
      refs: { character: "character-1", location: "location-1", props: "props-tay" },
      provider: "fake",
      resultKey: "ket-qua-cu",
      origin: { x: 900, y: 40 },
    }).graph;
    await save(stale);

    const blocked = await run();
    expect(blocked.status).toBe("failed");
    expect(blocked.error).toContain("Kiểm luật trước khi chạy");
    expect(blocked.error).toContain("khúc gỗ");
    expect(s.log.video).toBe(0);
    expect(blocked.nodes["writer-1"]?.status).toBe("succeeded");
    // Kiểm luật trước khi lưu: workflow và đồ thị của run giữ nguyên nhóm cũ (1 cảnh, kết quả cũ).
    const wf = await getWorkflow();
    expect(wf.graph).toEqual(WorkflowResponseSchema.shape.graph.parse(stale));
    expect(JSON.parse(s.db.select().from(runs).where(eq(runs.id, blocked.id)).get()!.graphJson)).toEqual(wf.graph);
    const ids = sceneIds(wf.graph);
    expect(ids).toHaveLength(1);
    expect(blocked.nodes[ids[0]!]?.status).toBe("skipped");
  });

  it("POST scenes: Biên kịch chưa có kết quả → 409; workflow lạ → 404; thân sai → 400", async () => {
    await save(ideaGraph(IDEA_A));
    const none = await s.app.inject({ method: "POST", url: `/api/workflows/${WF}/scenes`, payload: { writerId: "writer-1" } });
    expect(none.statusCode).toBe(409);
    expect(none.json<{ error: string }>().error).toBe("Biên kịch chưa có kết quả: bấm Chạy trước");
    expect((await s.app.inject({ method: "POST", url: "/api/workflows/khong-co/scenes", payload: { writerId: "writer-1" } })).statusCode).toBe(404);
    expect((await s.app.inject({ method: "POST", url: `/api/workflows/${WF}/scenes`, payload: { choice: "xoa" } })).statusCode).toBe(400);
  });
});
