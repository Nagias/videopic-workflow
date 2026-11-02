import { describe, expect, it } from "vitest";
import { restoreSceneGroups } from "./restore-groups";
import type { WorkflowGraph, WorkflowGroup } from "./workflow";

const scene = (id: string, x: number) => ({ id, type: "scene", position: { x, y: 0 }, params: { motion: id } });
const clip = (id: string) => ({ id: `e-${id}`, source: id, sourceHandle: "clip", target: "combine-g1", targetHandle: "clips" });

// Giống Sơn La sau khi bị lưu đè mất nhóm: ba cảnh cắm vào Ghép phim "combine-g1", không có nhóm nào.
function lost(order?: string[]): WorkflowGraph {
  return {
    nodes: [
      { id: "character-1", type: "character", position: { x: -400, y: 0 }, params: {} },
      scene("scene-g1-1", 0),
      scene("scene-g1-2", 230),
      scene("scene-g1-3", 460),
      { id: "combine-g1", type: "film-combine", position: { x: 800, y: 0 }, params: order ? { order } : {} },
    ],
    edges: [clip("scene-g1-1"), clip("scene-g1-2"), clip("scene-g1-3"), { id: "r", source: "character-1", sourceHandle: "character", target: "scene-g1-1", targetHandle: "character" }],
    groups: [],
  };
}

describe("restoreSceneGroups", () => {
  it("không có nhóm cũ nào: tạo nhóm 'Phân cảnh' mã g1 (theo tên Ghép phim), cảnh theo thứ tự clip", () => {
    const { graph, restored } = restoreSceneGroups(lost(["scene-g1-2", "scene-g1-1", "scene-g1-3"]), []);
    expect(restored).toEqual([{ id: "g1", label: "Phân cảnh", nodeIds: ["scene-g1-2", "scene-g1-1", "scene-g1-3"] }]);
    expect(graph.groups).toEqual(restored);
    expect(graph.nodes).toEqual(lost(["scene-g1-2", "scene-g1-1", "scene-g1-3"]).nodes);
    expect(graph.edges).toEqual(lost().edges);
  });

  it("không có order: cảnh theo toạ độ trái sang phải", () => {
    expect(restoreSceneGroups(lost(), []).restored[0]?.nodeIds).toEqual(["scene-g1-1", "scene-g1-2", "scene-g1-3"]);
  });

  it("lần chạy cũ có nhóm gồm đúng các cảnh đó: lấy y nguyên (kể cả source của Biên kịch)", () => {
    const old: WorkflowGroup = { id: "g1", label: "Phân cảnh", nodeIds: ["scene-g1-1", "scene-g1-2", "scene-g1-3"], source: { writerId: "w", resultKey: "k", snapshot: "s" } };
    const { restored } = restoreSceneGroups(lost(), [[], [old]]);
    expect(restored).toEqual([old]);
  });

  it("nhóm cũ khác thành viên hoặc là nhóm tay thì không dùng, tạo nhóm mới", () => {
    const other: WorkflowGroup = { id: "g1", label: "Phân cảnh", nodeIds: ["scene-g1-1", "scene-g1-2"] };
    const manual: WorkflowGroup = { id: "m", label: "Nhóm", manual: true, nodeIds: ["scene-g1-1", "scene-g1-2", "scene-g1-3"] };
    expect(restoreSceneGroups(lost(), [[other, manual]]).restored).toEqual([{ id: "g1", label: "Phân cảnh", nodeIds: ["scene-g1-1", "scene-g1-2", "scene-g1-3"] }]);
  });

  it("đã có nhóm (dù chỉ một phần cảnh): giữ nguyên, trả đúng đồ thị cũ", () => {
    const partial = { ...lost(), groups: [{ id: "x", label: "Nhóm", manual: true, nodeIds: ["scene-g1-1"] }] };
    const r = restoreSceneGroups(partial, []);
    expect(r.restored).toEqual([]);
    expect(r.graph).toBe(partial);
  });

  it("mã g1 đã bị nhóm khác dùng: lấy g2", () => {
    const g = { ...lost(), groups: [{ id: "g1", label: "Nhóm", manual: true, nodeIds: ["character-1"] }] };
    expect(restoreSceneGroups(g, []).restored[0]?.id).toBe("g2");
  });

  it("không có Ghép phim hoặc không có cảnh cắm vào: không làm gì", () => {
    const noCombine: WorkflowGraph = { nodes: [scene("s", 0)], edges: [], groups: [] };
    expect(restoreSceneGroups(noCombine, []).restored).toEqual([]);
  });
});
