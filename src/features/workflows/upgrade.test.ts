import { describe, expect, it } from "vitest";
import type { Shot } from "../../shared/director";
import { groupEdited, snapshotGroup } from "../../shared/scenes";
import { SON_LA_SHOTS, WORKFLOW_TEMPLATES } from "../../shared/templates";
import type { WorkflowGraph } from "../../shared/workflow";
import { legacyIdeaGraph, legacySonLaGraph } from "../../../tests/helpers/legacy";
import { upgradeLegacyGraph } from "./upgrade";

const ofType = (g: WorkflowGraph, type: string) => g.nodes.filter((n) => n.type === type);

const writerShots = (n: number): Shot[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${String(i + 1).padStart(2, "0")}`,
    size: "MS",
    angle: "eye",
    move: "static",
    subject: i === 0 ? "none" : "character",
    link: "cut",
    start: `khung đầu cảnh ${i + 1}`,
    motion: `việc xảy ra ở cảnh ${i + 1}`,
    props: "",
  }));

describe("chuyển workflow cũ (upgradeLegacyGraph)", () => {
  it("Sơn La cũ → 12 scene + 1 film-combine, không còn shotlist/film, dây follow ở cảnh 6 và 10", () => {
    const { graph, changed } = upgradeLegacyGraph(legacySonLaGraph("muse", false));
    expect(changed).toBe(true);
    expect(ofType(graph, "shotlist")).toEqual([]);
    expect(ofType(graph, "film")).toEqual([]);
    expect(graph.edges.some((e) => e.source === "film-1" || e.target === "film-1" || e.source === "shotlist-1")).toBe(false);
    expect(graph.nodes.map((n) => n.id).slice(0, 3)).toEqual(["character-1", "location-1", "props-1"]);

    const scenes = ofType(graph, "scene");
    expect(scenes).toHaveLength(12);
    const ids = scenes.map((n) => n.id);
    const follows = graph.edges.filter((e) => e.targetHandle === "follow").map((e) => [e.source, e.sourceHandle, e.target]);
    expect(follows).toEqual([
      [ids[4], "clip", ids[5]],
      [ids[8], "clip", ids[9]],
    ]);
    // Giữ nguyên chữ từng cảnh và dịch vụ của Dựng phim; mỗi cảnh nối đủ Nhân vật/Không gian/Đồ vật của Dựng phim.
    SON_LA_SHOTS.forEach((s, i) => {
      expect(scenes[i]!.params).toEqual({ size: s.size, angle: s.angle, move: s.move, subject: s.subject, start: s.start, motion: s.motion, props: s.props, provider: "muse" });
      expect(graph.edges.filter((e) => e.target === ids[i]! && e.targetHandle !== "follow").map((e) => `${e.source}.${e.sourceHandle}`).sort()).toEqual([
        "character-1.character",
        "location-1.location",
        "props-1.props",
      ]);
    });
    expect(scenes[0]!.position).toEqual({ x: 1120, y: 40 });

    const combines = ofType(graph, "film-combine");
    expect(combines).toHaveLength(1);
    expect(combines[0]!.params).toEqual({ fixBrightness: false, order: ids });
    expect(graph.groups).toHaveLength(1);
    expect(graph.groups![0]).toMatchObject({ nodeIds: ids });
    expect(graph.groups![0]!.source).toBeUndefined();
  });

  it("Ý tưởng → phim cũ có kết quả Biên kịch → 8 scene, nhóm có source.writerId", () => {
    const writers = new Map([["writer-1", { key: "khoa-bien-kich", shots: writerShots(8) }]]);
    const { graph, changed } = upgradeLegacyGraph(legacyIdeaGraph("muse"), writers);
    expect(changed).toBe(true);
    expect(ofType(graph, "film")).toEqual([]);
    expect(ofType(graph, "scene")).toHaveLength(8);
    expect(ofType(graph, "film-combine")).toHaveLength(1);
    // Biên kịch, dây Biên kịch → Đồ vật giữ nguyên.
    expect(graph.nodes.find((n) => n.id === "writer-1")?.type).toBe("writer");
    expect(graph.edges.some((e) => e.source === "writer-1" && e.target === "props-1" && e.targetHandle === "spec")).toBe(true);
    expect(graph.edges.some((e) => e.source === "writer-1" && e.sourceHandle === "shots")).toBe(false);

    const group = graph.groups![0]!;
    expect(group.nodeIds).toEqual(ofType(graph, "scene").map((n) => n.id));
    expect(group.source).toEqual({ writerId: "writer-1", resultKey: "khoa-bien-kich", snapshot: snapshotGroup(graph, group.id) });
    expect(groupEdited(graph, group.id)).toBe(false);
    expect(ofType(graph, "scene")[1]!.params).toMatchObject({ start: "khung đầu cảnh 2", motion: "việc xảy ra ở cảnh 2", provider: "muse" });
  });

  it("không có kết quả Biên kịch → chỉ còn writer + film-combine rỗng", () => {
    const { graph, changed } = upgradeLegacyGraph(legacyIdeaGraph("muse"));
    expect(changed).toBe(true);
    expect(graph.nodes.map((n) => n.type)).toEqual(["character", "location", "writer", "props", "film-combine"]);
    const combine = ofType(graph, "film-combine")[0]!;
    expect(combine.params).toEqual({ fixBrightness: true, order: [] });
    expect(graph.edges.filter((e) => e.target === combine.id)).toEqual([]);
    expect(graph.groups).toHaveLength(1);
    const group = graph.groups![0]!;
    expect(group).toEqual({ id: group.id, label: "Phân cảnh", nodeIds: [], source: { writerId: "writer-1", resultKey: "", snapshot: snapshotGroup(graph, group.id) } });
  });

  it("graph mới không đổi (changed=false)", () => {
    const once = upgradeLegacyGraph(legacySonLaGraph()).graph;
    const twice = upgradeLegacyGraph(once);
    expect(twice.changed).toBe(false);
    expect(twice.graph).toEqual(once);
    for (const t of WORKFLOW_TEMPLATES) expect(upgradeLegacyGraph(t.graph).changed, t.id).toBe(false);
  });

  it("dây Phim của Dựng phim chuyển sang Ghép phim mới", () => {
    const legacy = legacySonLaGraph();
    legacy.nodes.push({ id: "outer", type: "film-combine", position: { x: 2000, y: 0 }, params: { fixBrightness: true } });
    legacy.edges.push({ id: "e-film-outer", source: "film-1", sourceHandle: "video", target: "outer", targetHandle: "clips" });
    const { graph } = upgradeLegacyGraph(legacy);
    const combineId = ofType(graph, "film-combine").find((n) => n.id !== "outer")!.id;
    expect(graph.edges.filter((e) => e.target === "outer")).toEqual([{ id: "e-film-outer", source: combineId, sourceHandle: "video", target: "outer", targetHandle: "clips" }]);
  });
});
