import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeTextReply } from "../providers/fake/text";
import { EstimateResponseSchema, RunResponseSchema, WorkflowResponseSchema, type EstimateResponse } from "../shared/api";
import type { RunScope } from "../shared/api";
import { expandScenes } from "../shared/scenes";
import { WORKFLOW_TEMPLATES } from "../shared/templates";
import type { WorkflowGraph } from "../shared/workflow";
import { legacySonLaGraph } from "../../tests/helpers/legacy";
import { createTestServer, type TestServer } from "../../tests/helpers/server";

const ZERO = { image: 0, video: 0, text: 0 };

// Ước tính phải khớp số lượt thật: mỗi test so ước tính với số lần gọi dịch vụ giả của lần chạy ngay sau đó.
describe("ước tính lượt trước khi chạy (POST /api/workflows/:id/estimate)", () => {
  let s: TestServer;
  let wf = "son-la";
  beforeEach(async () => {
    wf = "son-la";
    s = await createTestServer({
      // Ý tưởng B chỉ đổi chữ cảnh 4 so với kịch bản giả.
      textReply: (prompt) => {
        const reply = fakeTextReply(prompt);
        return prompt.includes("ngồi nghỉ ngắm thác") ? reply.replace("việc xảy ra ở cảnh 4", "cô ngồi nghỉ trên tảng đá ngắm thác") : reply;
      },
    });
  });
  afterEach(async () => {
    await s.cleanup();
  });

  const sonLa = (provider: "fake" | "muse"): WorkflowGraph => {
    const g = WORKFLOW_TEMPLATES.find((t) => t.id === "sinh-ton-son-la")!.graph;
    return { ...g, nodes: g.nodes.map((n) => ("provider" in n.params ? { ...n, params: { ...n.params, provider } } : n)) };
  };
  const save = async (graph: WorkflowGraph) => expect((await s.app.inject({ method: "PUT", url: `/api/workflows/${wf}`, payload: { graph } })).statusCode).toBe(200);
  const open = async () => WorkflowResponseSchema.parse((await s.app.inject({ method: "GET", url: `/api/workflows/${wf}` })).json());
  const estimate = async (scope?: RunScope): Promise<EstimateResponse> => {
    const res = await s.app.inject({ method: "POST", url: `/api/workflows/${wf}/estimate`, payload: scope ? { scope } : {} });
    expect(res.statusCode, res.body).toBe(200);
    return EstimateResponseSchema.parse(res.json());
  };
  const counts = () => ({ image: s.log.image, video: s.log.video, text: s.log.text });
  // Chạy rồi trả số lượt thật đã tốn.
  const run = async (scope?: RunScope) => {
    const before = counts();
    const start = await s.app.inject({ method: "POST", url: `/api/workflows/${wf}/runs`, payload: scope ? { scope } : {} });
    expect(start.statusCode, start.body).toBe(202);
    while (await s.deps.queue.processNext());
    const done = RunResponseSchema.parse((await s.app.inject({ method: "GET", url: `/api/runs/${start.json<{ runId: string }>().runId}` })).json());
    expect(done.status, done.error ?? "").toBe("succeeded");
    const after = counts();
    return { image: after.image - before.image, video: after.video - before.video, text: after.text - before.text };
  };
  const setParam = (graph: WorkflowGraph, id: string, key: string, value: unknown): WorkflowGraph => ({
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n)),
  });
  const statusOf = (e: EstimateResponse, id: string) => e.nodes.find((n) => n.id === id)?.status;
  const sceneIds = (graph: WorkflowGraph) => graph.groups![0]!.nodeIds;

  it("Sơn La mới chưa chạy: museTotal = { image: 24, video: 12, text: 0 }", async () => {
    await save(sonLa("muse"));
    const e = await estimate();
    // Ảnh mẫu: nhân vật 4, bối cảnh 2, đồ vật 9 trạng thái; ảnh khung: 12 cảnh trừ c07 (chữ→video), c06, c10 (nối) = 9.
    expect(e.museTotal).toEqual({ image: 24, video: 12, text: 0 });
    expect(e.total).toEqual(e.museTotal);
    expect(e.waitsOnWriter).toBe(false);
    expect(e.nodes).toHaveLength(16);
    expect(e.nodes.every((n) => n.status === "run")).toBe(true);
    expect(e.nodes.find((n) => n.id === "props-1")).toMatchObject({ provider: "muse", calls: { image: 9, video: 0, text: 0 } });
    const combine = e.nodes.find((n) => n.label === "Ghép phim")!;
    expect(combine).toMatchObject({ provider: null, calls: ZERO });
    // Dịch vụ giả không tính vào museTotal.
    await save(sonLa("fake"));
    const fake = await estimate();
    expect(fake.museTotal).toEqual(ZERO);
    expect(fake.total).toEqual({ image: 24, video: 12, text: 0 });
    expect(await run()).toEqual(fake.total);
  });

  it("chạy xong rồi ước tính: total 0, mọi node cached", async () => {
    await save(sonLa("fake"));
    await run();
    const e = await estimate();
    expect(e.total).toEqual(ZERO);
    expect(e.nodes.map((n) => n.status)).toEqual(Array<string>(16).fill("cached"));
    expect(await run()).toEqual(ZERO);
  });

  it("Sơn La cũ (Dựng phim) đã chuyển khi mở: ước tính 0 ảnh, chỉ 2 cảnh nối ước dư 1 video; chạy lại rồi total 0", async () => {
    await save(legacySonLaGraph());
    await run();
    const graph = (await open()).graph;
    const e = await estimate();
    // Bước con của Dựng phim dùng chung với Cảnh: mọi ảnh khung và clip có sẵn. Cảnh nối chưa biết clip của cảnh trước
    // (cảnh trước có khoá node mới) nên ước 1 video — ước dư, không ước thiếu.
    expect(e.total).toEqual({ image: 0, video: 2, text: 0 });
    const ids = sceneIds(graph);
    expect(e.nodes.filter((n) => n.calls.video > 0).map((n) => n.id)).toEqual([ids[5], ids[9]]);
    expect(await run()).toEqual(ZERO);
    expect((await estimate()).total).toEqual(ZERO);
  });

  it("sửa motion cảnh 3 → video 1, ảnh 0 (ảnh khung dùng lại)", async () => {
    await save(sonLa("fake"));
    await run();
    const graph = (await open()).graph;
    const ids = sceneIds(graph);
    await save(setParam(graph, ids[2]!, "motion", "cô gái đặt rìu xuống, phủi tay"));
    const e = await estimate();
    expect(e.total).toEqual({ image: 0, video: 1, text: 0 });
    expect(e.nodes.filter((n) => n.status === "run").map((n) => n.id)).toEqual([ids[2], graph.nodes.find((n) => n.type === "film-combine")!.id]);
    expect(await run()).toEqual(e.total);
  });

  it("sửa motion cảnh 5 → run: cảnh 5 và cảnh 6, video = 2", async () => {
    await save(sonLa("fake"));
    await run();
    const graph = (await open()).graph;
    const ids = sceneIds(graph);
    await save(setParam(graph, ids[4]!, "motion", "cô gái kéo khúc gỗ lại gần gốc cây"));
    const e = await estimate();
    expect(statusOf(e, ids[4]!)).toBe("run");
    expect(statusOf(e, ids[5]!)).toBe("run");
    expect(statusOf(e, ids[6]!)).toBe("cached");
    expect(e.total).toEqual({ image: 0, video: 2, text: 0 });
    // Dịch vụ giả dựng clip từ ảnh khung, bỏ qua prompt: clip mới của cảnh 5 trùng từng byte clip cũ (cùng mã media) nên
    // cảnh 6 trúng cache. Với Muse clip mới khác, khung cuối khác, cảnh 6 tốn đúng 1 video như ước tính.
    expect(await run()).toEqual({ image: 0, video: 1, text: 0 });
  });

  it("take cảnh 3 = 2 → video = 1, ảnh = 1", async () => {
    await save(sonLa("fake"));
    await run();
    const graph = (await open()).graph;
    await save(setParam(graph, sceneIds(graph)[2]!, "take", 2));
    const e = await estimate();
    expect(e.total).toEqual({ image: 1, video: 1, text: 0 });
    expect(await run()).toEqual(e.total);
  });

  it("phạm vi node: chỉ node đó và phía trước; node lạ hoặc thân sai → 400; workflow lạ → 404", async () => {
    await save(sonLa("muse"));
    const graph = (await open()).graph;
    const e = await estimate({ mode: "node", nodeId: "character-1" });
    expect(e.nodes.map((n) => n.id)).toEqual(["character-1"]);
    expect(e.museTotal).toEqual({ image: 4, video: 0, text: 0 });
    const last = await estimate({ mode: "node", nodeId: sceneIds(graph)[11]! });
    expect(last.nodes.map((n) => n.id)).toEqual(["character-1", "location-1", "props-1", sceneIds(graph)[11]!]);
    expect(last.museTotal).toEqual({ image: 4 + 2 + 9 + 1, video: 1, text: 0 });
    // Phía sau Đồ vật: mọi Cảnh và Ghép phim (cùng phía trước của chúng) = cả workflow.
    expect((await estimate({ mode: "downstream", nodeId: "props-1" })).nodes).toHaveLength(16);
    const bad = await s.app.inject({ method: "POST", url: `/api/workflows/${wf}/estimate`, payload: { scope: { mode: "node", nodeId: "khong-co" } } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json<{ error: string }>().error).toContain("khong-co");
    const wrong = await s.app.inject({ method: "POST", url: `/api/workflows/${wf}/estimate`, payload: { scope: { mode: "node" } } });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json<{ error: string }>().error).toMatch(/Phạm vi chạy không hợp lệ/);
    expect((await s.app.inject({ method: "POST", url: "/api/workflows/khong-co/estimate", payload: {} })).statusCode).toBe(404);
  });

  describe("Biên kịch → Đồ vật (cổng spec) → nhóm Phân cảnh", () => {
    const IDEA_A = "Cô gái đi bộ một mình vào rừng nguyên sinh, tìm thấy thác nước nhỏ rồi nhóm bếp đá đun nước.";
    const IDEA_B = "Cô gái đi bộ một mình vào rừng nguyên sinh, tìm thấy thác nước nhỏ rồi ngồi nghỉ ngắm thác.";
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
    beforeEach(() => {
      wf = "y-tuong";
    });

    it("lần đầu: Biên kịch sẽ viết → waitsOnWriter, Đồ vật 'unknown'; nhóm rỗng chưa có cảnh", async () => {
      await save(ideaGraph(IDEA_A));
      const e = await estimate();
      expect(e.waitsOnWriter).toBe(true);
      expect(statusOf(e, "writer-1")).toBe("run");
      expect(statusOf(e, "props-1")).toBe("unknown");
      expect(e.total).toEqual({ image: 6, video: 0, text: 1 });
    });

    it("đổi ý tưởng: Biên kịch sẽ viết lại → cảnh của nhóm 'unknown'", async () => {
      await save(ideaGraph(IDEA_A));
      await run();
      const graph = (await open()).graph;
      await save(setParam(graph, "writer-1", "idea", IDEA_B));
      const e = await estimate();
      expect(e.waitsOnWriter).toBe(true);
      expect(statusOf(e, "writer-1")).toBe("run");
      for (const id of [...sceneIds(graph), "props-1"]) expect(statusOf(e, id), id).toBe("unknown");
      expect(statusOf(e, "character-1")).toBe("cached");
    });

    it("đổi ý tưởng, chạy riêng Biên kịch rồi ước tính cả workflow: chỉ cảnh đổi chữ tốn 1 video (Đồ vật và cảnh khác chạy lại nhưng 0 lượt)", async () => {
      await save(ideaGraph(IDEA_A));
      await run();
      const graph = (await open()).graph;
      const ids = sceneIds(graph);
      await save(setParam(graph, "writer-1", "idea", IDEA_B));
      expect(await run({ mode: "node", nodeId: "writer-1" })).toEqual({ image: 0, video: 0, text: 1 });
      const e = await estimate();
      expect(e.waitsOnWriter).toBe(false);
      expect(statusOf(e, "writer-1")).toBe("cached");
      // Khoá Đồ vật và mọi Cảnh đổi theo khoá Biên kịch nên "run", nhưng bước con có sẵn.
      expect(e.nodes.find((n) => n.id === "props-1")).toMatchObject({ status: "run", calls: ZERO });
      for (const id of ids.slice(0, 3)) expect(e.nodes.find((n) => n.id === id), id).toMatchObject({ status: "run", calls: ZERO });
      expect(e.nodes.find((n) => n.id === ids[3])).toMatchObject({ status: "run", calls: { image: 0, video: 1, text: 0 } });
      expect(e.total).toEqual({ image: 0, video: 1, text: 0 });
      expect(e.museTotal).toEqual(ZERO);
      expect(await run()).toEqual(e.total);
    });

    it("Biên kịch dùng lại kết quả cũ khác nhóm đang giữ: ước tính theo bộ cảnh Biên kịch sẽ tạo lại (mọi cảnh cached)", async () => {
      await save(ideaGraph(IDEA_A));
      await run();
      const graph = (await open()).graph;
      await save(setParam(graph, "writer-1", "idea", IDEA_B));
      await run();
      await save(setParam((await open()).graph, "writer-1", "idea", IDEA_A));
      const e = await estimate();
      expect(e.waitsOnWriter).toBe(false);
      expect(e.total).toEqual(ZERO);
      expect(e.nodes.every((n) => n.status === "cached")).toBe(true);
      expect(await run()).toEqual(ZERO);
    });
  });
});
