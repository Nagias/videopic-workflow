import { describe, expect, it } from "vitest";
import { ShotSchema, type Shot } from "./director";
import { expandScenes, groupEdited, SCENE_GRID, snapshotGroup } from "./scenes";
import { sha256Hex } from "./hash";
import { WORKFLOW_TEMPLATES } from "./templates";
import type { WorkflowGraph } from "./workflow";

const sonLaShots = (): Shot[] => {
  const graph = WORKFLOW_TEMPLATES.find((t) => t.id === "sinh-ton-son-la")!.graph;
  return ShotSchema.array().parse(graph.nodes.find((n) => n.type === "shotlist")!.params.shots);
};

const refsGraph = (): WorkflowGraph => ({
  nodes: [
    { id: "character-1", type: "character", position: { x: 40, y: 40 }, params: { description: "cô gái", provider: "fake" } },
    { id: "location-1", type: "location", position: { x: 40, y: 640 }, params: { description: "sườn đồi", provider: "fake" } },
    { id: "props-1", type: "props", position: { x: 40, y: 1140 }, params: { items: [], provider: "fake" } },
  ],
  edges: [],
});

const REFS = { character: "character-1", location: "location-1", props: "props-1" };

describe("sha256 dùng chung (chạy được cả ở giao diện)", () => {
  it("khớp giá trị chuẩn, kể cả chữ có dấu và chuỗi dài", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("Biên kịch ra bộ cảnh mới 🎬")).toBe("94e8e4189b62c3bb7554409e27d019467ee45d164eaf056a0033541f826066db");
    expect(sha256Hex("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
  });
});

describe("nhóm Phân cảnh (expandScenes)", () => {
  it("expandScenes 12 cảnh Sơn La: 12 scene, 2 dây follow (c06, c10), 36 dây tham chiếu, combine order đúng 12 mã", () => {
    const shots = sonLaShots();
    const { graph, groupId, combineId } = expandScenes(refsGraph(), { shots, refs: REFS, provider: "muse", origin: { x: 500, y: 40 } });

    const scenes = graph.nodes.filter((n) => n.type === "scene");
    expect(scenes).toHaveLength(12);
    const ids = scenes.map((n) => n.id);
    expect(ids).toEqual(Array.from({ length: 12 }, (_, i) => `scene-${groupId}-${i + 1}`));

    const follows = graph.edges.filter((e) => e.targetHandle === "follow");
    expect(follows.map((e) => [e.source, e.sourceHandle, e.target])).toEqual([
      [ids[4], "clip", ids[5]],
      [ids[8], "clip", ids[9]],
    ]);
    const refEdges = graph.edges.filter((e) => ["character", "location", "props"].includes(e.targetHandle));
    expect(refEdges).toHaveLength(36);
    for (const id of ids) {
      expect(refEdges.filter((e) => e.target === id).map((e) => `${e.source}.${e.sourceHandle}→${e.targetHandle}`).sort()).toEqual([
        "character-1.character→character",
        "location-1.location→location",
        "props-1.props→props",
      ]);
    }

    const combine = graph.nodes.find((n) => n.id === combineId)!;
    expect(combine.type).toBe("film-combine");
    expect(combine.params).toEqual({ fixBrightness: true, order: ids });
    expect(graph.edges.filter((e) => e.target === combineId).map((e) => `${e.source}.${e.sourceHandle}→${e.targetHandle}`)).toEqual(ids.map((id) => `${id}.clip→clips`));

    // Tham số cảnh: đúng chữ của danh sách cảnh, không mang mã cảnh hay kiểu nối; lưới 6 cột, ô 230 × 250.
    expect(scenes[2]!.params).toEqual({
      size: shots[2]!.size,
      angle: shots[2]!.angle,
      move: shots[2]!.move,
      subject: shots[2]!.subject,
      start: shots[2]!.start,
      motion: shots[2]!.motion,
      props: shots[2]!.props,
      provider: "muse",
    });
    expect(SCENE_GRID).toEqual({ cols: 6, width: 230, height: 250 });
    expect(scenes[0]!.position).toEqual({ x: 500, y: 40 });
    expect(scenes[5]!.position).toEqual({ x: 500 + 5 * 230, y: 40 });
    expect(scenes[6]!.position).toEqual({ x: 500, y: 40 + 250 });

    expect(graph.groups).toEqual([{ id: groupId, label: "Phân cảnh", nodeIds: ids }]);
    // Đồ thị gốc không bị sửa (hàm thuần).
    expect(refsGraph().nodes).toHaveLength(3);
  });

  it("thay nhóm: mã node ổn định theo số thứ tự", () => {
    const shots = sonLaShots();
    const first = expandScenes(refsGraph(), { writerId: "writer-1", shots, refs: REFS, provider: "fake", resultKey: "k1", origin: { x: 500, y: 40 } });
    // Người dùng kéo node Ghép phim đi chỗ khác và đổi bù sáng: thay nhóm phải giữ nguyên node đó.
    const moved: WorkflowGraph = {
      ...first.graph,
      nodes: first.graph.nodes.map((n) => (n.id === first.combineId ? { ...n, position: { x: 9000, y: 9000 }, params: { ...n.params, fixBrightness: false } } : n)),
    };
    const fewer = shots.slice(0, 10).map((s, i) => (i === 3 ? { ...s, motion: "bàn tay đặt rìu xuống" } : s));
    const second = expandScenes(moved, { writerId: "writer-1", groupId: first.groupId, shots: fewer, refs: REFS, provider: "fake", resultKey: "k2", origin: { x: 500, y: 40 } });

    expect(second.groupId).toBe(first.groupId);
    expect(second.combineId).toBe(first.combineId);
    const ids = second.graph.nodes.filter((n) => n.type === "scene").map((n) => n.id);
    expect(ids).toEqual(Array.from({ length: 10 }, (_, i) => `scene-${first.groupId}-${i + 1}`));
    expect(second.graph.nodes.find((n) => n.id === `scene-${first.groupId}-4`)!.params.motion).toBe("bàn tay đặt rìu xuống");
    expect(second.graph.nodes.find((n) => n.id === `scene-${first.groupId}-11`)).toBeUndefined();
    // Không còn dây nào trỏ tới cảnh cũ đã bỏ; Ghép phim chỉ còn 10 clip, đúng thứ tự.
    const nodeIds = new Set(second.graph.nodes.map((n) => n.id));
    for (const e of second.graph.edges) expect(nodeIds.has(e.source) && nodeIds.has(e.target), e.id).toBe(true);
    const combine = second.graph.nodes.find((n) => n.id === first.combineId)!;
    expect(combine.position).toEqual({ x: 9000, y: 9000 });
    expect(combine.params).toEqual({ fixBrightness: false, order: ids });
    expect(second.graph.edges.filter((e) => e.target === first.combineId)).toHaveLength(10);
    expect(second.graph.nodes.filter((n) => n.type === "film-combine")).toHaveLength(1);
    expect(second.graph.groups).toHaveLength(1);
    expect(second.graph.groups![0]!.source).toMatchObject({ writerId: "writer-1", resultKey: "k2" });
    expect(groupEdited(second.graph, first.groupId)).toBe(false);

    // Nhóm rỗng (Biên kịch chưa có kết quả) vẫn có Ghép phim riêng; tạo lại thì dùng lại đúng node đó.
    const empty = expandScenes(refsGraph(), { writerId: "writer-1", shots: [], refs: REFS, provider: "fake", origin: { x: 0, y: 0 } });
    expect(empty.graph.groups![0]).toMatchObject({ nodeIds: [], source: { writerId: "writer-1", resultKey: "" } });
    const filled = expandScenes(empty.graph, { writerId: "writer-1", groupId: empty.groupId, shots, refs: REFS, provider: "fake", resultKey: "k", origin: { x: 0, y: 0 } });
    expect(filled.combineId).toBe(empty.combineId);
    expect(filled.graph.nodes.filter((n) => n.type === "film-combine")).toHaveLength(1);
  });

  it("groupEdited false ngay sau expand, true khi đổi motion một cảnh", () => {
    const { graph, groupId } = expandScenes(refsGraph(), { writerId: "writer-1", shots: sonLaShots(), refs: REFS, provider: "fake", resultKey: "k1", origin: { x: 0, y: 0 } });
    expect(groupEdited(graph, groupId)).toBe(false);
    const snap = snapshotGroup(graph, groupId);
    expect(snap).toMatch(/^[0-9a-f]{64}$/);

    // Chỉ kéo node trên canvas, đổi thứ tự node/dây trong mảng: không tính là sửa.
    const moved: WorkflowGraph = {
      ...graph,
      nodes: [...graph.nodes].reverse().map((n) => ({ ...n, position: { x: n.position.x + 77, y: n.position.y - 13 } })),
      edges: [...graph.edges].reverse().map((e) => ({ ...e, id: `${e.id}-moi` })),
    };
    expect(snapshotGroup(moved, groupId)).toBe(snap);
    expect(groupEdited(moved, groupId)).toBe(false);

    const sceneId = graph.groups![0]!.nodeIds[4]!;
    const edited: WorkflowGraph = { ...graph, nodes: graph.nodes.map((n) => (n.id === sceneId ? { ...n, params: { ...n.params, motion: "cô ngồi xuống nghỉ" } } : n)) };
    expect(groupEdited(edited, groupId)).toBe(true);

    // Bỏ một dây Nối tiếp, hoặc xoá một cảnh: cũng là sửa tay.
    const unwired: WorkflowGraph = { ...graph, edges: graph.edges.filter((e) => e.targetHandle !== "follow" || e.target !== graph.groups![0]!.nodeIds[5]) };
    expect(groupEdited(unwired, groupId)).toBe(true);
    const deleted: WorkflowGraph = { ...graph, nodes: graph.nodes.filter((n) => n.id !== sceneId), edges: graph.edges.filter((e) => e.source !== sceneId && e.target !== sceneId) };
    expect(groupEdited(deleted, groupId)).toBe(true);

    // Nhóm tạo tay (không có source) không bao giờ coi là "đã sửa so với Biên kịch".
    const manual = expandScenes(refsGraph(), { shots: sonLaShots(), refs: REFS, provider: "fake", origin: { x: 0, y: 0 } });
    expect(groupEdited(manual.graph, manual.groupId)).toBe(false);
  });
});
