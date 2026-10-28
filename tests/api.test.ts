import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runs } from "../src/core/db/schema";
import { createQueue } from "../src/core/queue";
import { AssetListResponseSchema, RunResponseSchema, WorkflowResponseSchema } from "../src/shared/api";
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

    const restarted = createQueue({ db: s.db, storage: s.storage, ffmpeg: s.ffmpeg, providers: s.deps.providers, nodes: s.deps.nodes }, { pollMs: 20 });
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
