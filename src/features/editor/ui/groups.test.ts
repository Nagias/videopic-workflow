import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { WORKFLOW_TEMPLATES } from "../../../shared/templates";
import type { WorkflowGraph, WorkflowGroup } from "../../../shared/workflow";
import { fromFlow, toFlow } from "./graph-convert";
import type { FlowNode } from "./GraphNode";
import {
  addManualGroup,
  bundleEdges,
  frameIdOf,
  FRAME_PADDING,
  FRAME_TITLE_HEIGHT,
  groupFrames,
  GROUP_FRAME_TYPE,
  measuredFrom,
  moveFramesTo,
  moveGroup,
  pruneEdgesFor,
  pruneManualGroups,
} from "./groups";

const sonLa = (): WorkflowGraph => WORKFLOW_TEMPLATES.find((t) => t.id === "sinh-ton-son-la")!.graph;
const SIZE = () => ({ w: 210, h: 200 });
const scenes = (groups: WorkflowGroup[]) => groups[0]!.nodeIds;

describe("khung nhóm Phân cảnh", () => {
  it("Sơn La: 1 khung bao 12 cảnh", () => {
    const graph = sonLa();
    const { nodes } = toFlow(graph);
    const frames = groupFrames(nodes, graph.groups!, SIZE);
    expect(frames).toHaveLength(1);
    const f = frames[0]!;
    expect(f.id).toBe("frame-g1");
    expect(f.id).toBe(frameIdOf("g1"));
    expect(f.type).toBe(GROUP_FRAME_TYPE);
    expect(f.zIndex).toBe(-1);
    expect(f.selectable).toBe(true);
    expect(f.deletable).toBe(false);
    expect(f.data.frame?.count).toBe(12);

    const members = nodes.filter((n) => scenes(graph.groups!).includes(n.id));
    expect(members).toHaveLength(12);
    const minX = Math.min(...members.map((n) => n.position.x));
    const minY = Math.min(...members.map((n) => n.position.y));
    const maxX = Math.max(...members.map((n) => n.position.x + 210));
    const maxY = Math.max(...members.map((n) => n.position.y + 200));
    expect(FRAME_PADDING).toBe(30);
    expect(FRAME_TITLE_HEIGHT).toBe(40);
    expect(f.position).toEqual({ x: minX - 30, y: minY - 30 - 40 });
    expect(f.width).toBe(maxX - minX + 60);
    expect(f.height).toBe(maxY - minY + 60 + 40);
    // Khung chứa hết 12 thẻ.
    for (const m of members) {
      expect(m.position.x).toBeGreaterThanOrEqual(f.position.x + 30);
      expect(m.position.y).toBeGreaterThanOrEqual(f.position.y + 70);
      expect(m.position.x + 210).toBeLessThanOrEqual(f.position.x + f.width! - 30);
      expect(m.position.y + 200).toBeLessThanOrEqual(f.position.y + f.height! - 30);
    }
  });

  it("tiêu đề: '▢ Phân cảnh · 12 cảnh · 59,8 giây'; chưa biết thời lượng thì bỏ đoạn giây, không ghi 0 giây", () => {
    const graph = sonLa();
    const { nodes } = toFlow(graph);
    const ids = scenes(graph.groups!);
    const noSeconds = groupFrames(nodes, graph.groups!, SIZE)[0]!;
    expect(noSeconds.data.frame?.title).toBe("▢ Phân cảnh · 12 cảnh");

    const known = new Map(ids.map((id, i) => [id, i < 11 ? 5 : 4.8]));
    const full = groupFrames(nodes, graph.groups!, SIZE, { secondsOf: (id) => known.get(id) })[0]!;
    expect(full.data.frame?.title).toBe("▢ Phân cảnh · 12 cảnh · 59,8 giây");

    // Mới có vài cảnh chạy xong: không ghi tổng dở dang.
    const partial = groupFrames(nodes, graph.groups!, SIZE, { secondsOf: (id) => (id === ids[0] ? 5 : undefined) })[0]!;
    expect(partial.data.frame?.title).toBe("▢ Phân cảnh · 12 cảnh");
  });

  it("dòng kiểm luật: không truyền cảnh báo thì không có dòng nào; truyền thì '✓ Luật đạo diễn đạt' hoặc danh sách cảnh báo", () => {
    const graph = sonLa();
    const { nodes } = toFlow(graph);
    const ids = scenes(graph.groups!);
    expect(groupFrames(nodes, graph.groups!, SIZE)[0]!.data.frame?.rule).toBeUndefined();
    expect(groupFrames(nodes, graph.groups!, SIZE, { warnings: [] })[0]!.data.frame?.rule).toEqual({ ok: true, lines: ["✓ Luật đạo diễn đạt"] });
    const warned = groupFrames(nodes, graph.groups!, SIZE, {
      warnings: [
        { nodeId: ids[3]!, message: "Cảnh 4 vi phạm luật 30°" },
        { nodeId: "node-ngoai-nhom", message: "không thuộc nhóm" },
      ],
    })[0]!;
    expect(warned.data.frame?.rule).toEqual({ ok: false, lines: ["Cảnh 4 vi phạm luật 30°"] });
  });

  it("nhóm tay: tiêu đề theo tên nhóm, đếm node, không có dòng kiểm luật; thành viên đã xoá thì bỏ qua, hết thành viên thì không có khung", () => {
    const nodes: FlowNode[] = [
      { id: "a", type: "prompt", position: { x: 0, y: 0 }, data: { params: {} } },
      { id: "b", type: "prompt", position: { x: 300, y: 100 }, data: { params: {} } },
    ];
    const groups: WorkflowGroup[] = [
      { id: "manual-1", label: "Nhóm 1", nodeIds: ["a", "b", "da-xoa"], manual: true },
      { id: "manual-2", label: "Nhóm 2", nodeIds: ["da-xoa"], manual: true },
    ];
    const frames = groupFrames(nodes, groups, SIZE, { warnings: [] });
    expect(frames.map((f) => f.id)).toEqual(["frame-manual-1"]);
    expect(frames[0]!.data.frame?.title).toBe("▢ Nhóm 1 · 2 node");
    expect(frames[0]!.data.frame?.rule).toBeUndefined();
  });

  it("khung được chọn khi id nằm trong tập đã chọn", () => {
    const graph = sonLa();
    const { nodes } = toFlow(graph);
    const frames = groupFrames(nodes, graph.groups!, SIZE, { selected: new Set(["frame-g1"]) });
    expect(frames[0]!.selected).toBe(true);
  });
});

describe("dây gộp vào mép nhóm", () => {
  it("36 dây tham chiếu → 3 dây gộp hiển thị, 36 dây gốc giữ nguyên", () => {
    const graph = sonLa();
    const { edges } = toFlow(graph);
    const before = JSON.stringify(edges);
    const { visible, bundled } = bundleEdges(edges, graph.groups!);
    expect(bundled).toHaveLength(36);
    const bundles = visible.filter((e) => e.target === "frame-g1");
    expect(bundles).toHaveLength(3);
    expect(bundles.map((e) => e.source).sort()).toEqual(["character-1", "location-1", "props-1"]);
    expect(bundles.map((e) => e.targetHandle).sort()).toEqual(["in-imageset", "in-imageset", "in-props"]);
    expect(bundles.every((e) => e.deletable === false && e.selectable === false)).toBe(true);
    expect(bundles.map((e) => e.className).sort()).toEqual(["kind-imageset", "kind-imageset", "kind-props"]);
    // Dây còn lại hiển thị = dây không bị gộp; dây gốc không bị sửa.
    expect(visible).toHaveLength(edges.length - 36 + 3);
    expect(bundled.every((e) => edges.includes(e))).toBe(true);
    expect(JSON.stringify(edges)).toBe(before);
    // Gộp xong, không dây hiển thị nào còn cắm thẳng vào cổng tham chiếu của cảnh.
    expect(visible.some((e) => ["character", "location", "props"].includes(e.targetHandle ?? ""))).toBe(false);
  });

  it("dây follow trong nhóm không bị gộp", () => {
    const graph = sonLa();
    const { edges } = toFlow(graph);
    const follows = edges.filter((e) => e.targetHandle === "follow");
    expect(follows.length).toBeGreaterThan(0);
    const { visible, bundled } = bundleEdges(edges, graph.groups!);
    for (const f of follows) {
      expect(visible).toContain(f);
      expect(bundled).not.toContain(f);
    }
    // Dây clip → Ghép phim (từ trong nhóm ra ngoài) cũng giữ nguyên.
    expect(visible.filter((e) => e.targetHandle === "clips")).toHaveLength(12);
  });

  it("nguồn chỉ nối vào một node trong nhóm thì không gộp; cùng nguồn nhưng khác cổng ra thì gộp riêng", () => {
    const group: WorkflowGroup = { id: "g", label: "Nhóm", nodeIds: ["a", "b", "c"] };
    const e = (id: string, source: string, sourceHandle: string, target: string, kind: string): Edge => ({
      id,
      source,
      sourceHandle,
      target,
      targetHandle: "x",
      className: `kind-${kind}`,
    });
    const edges = [e("1", "s", "out1", "a", "text"), e("2", "s", "out1", "b", "text"), e("3", "s", "out2", "c", "image"), e("4", "t", "out1", "a", "text")];
    const { visible, bundled } = bundleEdges(edges, [group]);
    expect(bundled.map((x) => x.id)).toEqual(["1", "2"]);
    expect(visible.map((x) => x.id)).toEqual(["3", "4", "bundle-g-s-out1"]);
    expect(visible.at(-1)).toMatchObject({ source: "s", sourceHandle: "out1", target: "frame-g", targetHandle: "in-text" });
  });
});

describe("kéo cả nhóm", () => {
  it("moveGroup dời cả 12 cảnh, node ngoài nhóm đứng yên, không sửa mảng cũ", () => {
    const graph = sonLa();
    const { nodes } = toFlow(graph);
    const ids = new Set(scenes(graph.groups!));
    const moved = moveGroup(nodes, graph.groups!, "g1", 200, -40);
    expect(moved).toHaveLength(nodes.length);
    for (const [i, n] of moved.entries()) {
      const old = nodes[i]!;
      if (ids.has(n.id)) expect(n.position).toEqual({ x: old.position.x + 200, y: old.position.y - 40 });
      else expect(n).toBe(old);
    }
    expect(moved.filter((n) => ids.has(n.id))).toHaveLength(12);
  });

  it("moveFramesTo đặt khung đúng vị trí đích (gọi hai lần cùng đích không dời thêm)", () => {
    const graph = sonLa();
    const { nodes } = toFlow(graph);
    const before = groupFrames(nodes, graph.groups!, measuredFrom(nodes))[0]!;
    const targets = new Map([["g1", { x: before.position.x + 200, y: before.position.y }]]);
    const once = moveFramesTo(nodes, graph.groups!, targets);
    const twice = moveFramesTo(once, graph.groups!, targets);
    expect(groupFrames(once, graph.groups!, measuredFrom(once))[0]!.position).toEqual(targets.get("g1"));
    expect(groupFrames(twice, graph.groups!, measuredFrom(twice))[0]!.position).toEqual(targets.get("g1"));
    expect(twice.map((n) => n.position)).toEqual(once.map((n) => n.position));
  });
});

describe("xoá node khi dây bị gộp", () => {
  it("pruneEdgesFor: xoá nguồn gộp (Nhân vật) hay đích gộp (một cảnh) thì mọi dây gốc chạm vào node đó đều đi theo, kể cả dây đang bị ẩn", () => {
    const graph = sonLa();
    const { edges } = toFlow(graph);
    const { visible, bundled } = bundleEdges(edges, graph.groups!);
    expect(bundled).toHaveLength(36);
    // xyflow chỉ thấy dây đang vẽ: chỉ riêng dây gộp thì dây gốc ẩn không bị đụng tới.
    expect(visible.filter((e) => e.source === "character-1")).toHaveLength(1);

    const noChar = pruneEdgesFor(edges, new Set(["character-1"]));
    expect(edges.filter((e) => e.source === "character-1")).toHaveLength(12);
    expect(noChar).toHaveLength(edges.length - 12);
    expect(noChar.some((e) => e.source === "character-1" || e.target === "character-1")).toBe(false);

    const scene3 = scenes(graph.groups!)[2]!;
    const noScene = pruneEdgesFor(edges, new Set([scene3]));
    expect(noScene.some((e) => e.source === scene3 || e.target === scene3)).toBe(false);
    expect(edges.filter((e) => e.source === scene3 || e.target === scene3).length).toBeGreaterThanOrEqual(4);
    expect(noScene).toHaveLength(edges.length - edges.filter((e) => e.source === scene3 || e.target === scene3).length);
  });

  it("không có dây nào chạm vào node bị xoá thì trả đúng mảng cũ", () => {
    const { edges } = toFlow(sonLa());
    expect(pruneEdgesFor(edges, new Set(["khong-co"]))).toBe(edges);
  });
});

describe("nhiều khung kéo cùng lúc", () => {
  it("thẻ nằm trong hai khung được kéo cùng lúc chỉ dời một lần", () => {
    const nodes: FlowNode[] = ["a", "b", "c"].map((id, i) => ({ id, type: "prompt", position: { x: i * 300, y: 0 }, data: { params: {} } }));
    const groups: WorkflowGroup[] = [
      { id: "g1", label: "Phân cảnh", nodeIds: ["a", "b"] },
      { id: "manual-1", label: "Nhóm 1", nodeIds: ["b", "c"], manual: true },
    ];
    const f = (gid: string) => groupFrames(nodes, groups, measuredFrom(nodes)).find((x) => x.id === `frame-${gid}`)!.position;
    const targets = new Map([
      ["g1", { x: f("g1").x + 100, y: f("g1").y }],
      ["manual-1", { x: f("manual-1").x + 100, y: f("manual-1").y }],
    ]);
    const moved = moveFramesTo(nodes, groups, targets);
    expect(moved.map((n) => n.position.x - nodes.find((o) => o.id === n.id)!.position.x)).toEqual([100, 100, 100]);
  });
});

describe("khung luôn nằm dưới thẻ", () => {
  it("zIndex của khung ghi trong style (xyflow nâng node đang chọn thêm ~1000 nếu chỉ dùng thuộc tính zIndex)", () => {
    const graph = sonLa();
    const { nodes } = toFlow(graph);
    const f = groupFrames(nodes, graph.groups!, SIZE, { selected: new Set(["frame-g1"]) })[0]!;
    expect(f.zIndex).toBe(-1);
    expect(f.style?.zIndex).toBe(-1);
  });
});

describe("nhóm không đi vào dữ liệu lưu", () => {
  it("fromFlow không chứa group-frame", () => {
    const graph = sonLa();
    const flow = toFlow(graph);
    const frames = groupFrames(flow.nodes, graph.groups!, SIZE);
    const { visible } = bundleEdges(flow.edges, graph.groups!);
    const saved = fromFlow([...frames, ...flow.nodes], [...visible], graph.groups!);
    expect(saved.nodes.map((n) => n.id)).toEqual(graph.nodes.map((n) => n.id));
    expect(saved.nodes.some((n) => n.type === GROUP_FRAME_TYPE)).toBe(false);
    expect(saved.edges.some((e) => e.target.startsWith("frame-") || e.targetHandle.startsWith("in-"))).toBe(false);
    expect(JSON.stringify(saved)).not.toContain("frame-");
  });
});

describe("nhóm tay (Ctrl+G)", () => {
  it("addManualGroup: mã không trùng, không có source, có manual, giữ thứ tự node truyền vào", () => {
    const groups: WorkflowGroup[] = [{ id: "g1", label: "Phân cảnh", nodeIds: ["x"], source: { writerId: "w", resultKey: "k", snapshot: "s" } }];
    const one = addManualGroup(groups, ["a", "b"]);
    expect(one).toHaveLength(2);
    expect(one[0]).toBe(groups[0]);
    expect(one[1]).toEqual({ id: "manual-1", label: "Nhóm 1", nodeIds: ["a", "b"], manual: true });
    expect(one[1]!.source).toBeUndefined();
    const two = addManualGroup(one, ["c", "d"]);
    expect(two[2]).toMatchObject({ id: "manual-2", label: "Nhóm 2" });
  });

  it("pruneManualGroups: xoá node thì rút khỏi nhóm tay và bỏ nhóm tay rỗng; nhóm Phân cảnh giữ nguyên", () => {
    const scene: WorkflowGroup = { id: "g1", label: "Phân cảnh", nodeIds: ["s1", "s2"] };
    const groups: WorkflowGroup[] = [scene, { id: "manual-1", label: "Nhóm 1", nodeIds: ["a", "b"], manual: true }, { id: "manual-2", label: "Nhóm 2", nodeIds: ["s1"], manual: true }];
    const next = pruneManualGroups(groups, new Set(["a", "s1"]));
    expect(next).toEqual([scene, { id: "manual-1", label: "Nhóm 1", nodeIds: ["b"], manual: true }]);
    expect(next[0]).toBe(scene);
    expect(pruneManualGroups(groups, new Set(["khong-co"]))).toBe(groups);
  });
});
