import { describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";
import { acceptersOf, connectionProblem, droppedConnectionProblem, edgeKindClass, replaceTargetEdges, targetAcceptsMany, toFlow } from "./graph-convert";
import type { FlowNode } from "./GraphNode";

const node = (id: string, type: string): FlowNode => ({ id, type, position: { x: 0, y: 0 }, data: { params: {} } });
const nodes = [node("p", "prompt"), node("v", "generate-video"), node("c", "character"), node("f", "film"), node("w", "writer")];

describe("nối dây giữa các node", () => {
  it("cùng loại thì nối được, kể cả cổng vào đã có dây (dây mới thay dây cũ)", () => {
    expect(connectionProblem({ source: "p", sourceHandle: "text", target: "v", targetHandle: "prompt" }, nodes)).toBeNull();
    expect(connectionProblem({ source: "c", sourceHandle: "character", target: "f", targetHandle: "character" }, nodes)).toBeNull();
  });

  it("khác loại: nói bằng tên cổng tiếng Việt và gợi ý chỗ cắm đúng", () => {
    const why = connectionProblem({ source: "c", sourceHandle: "character", target: "v", targetHandle: "prompt" }, nodes);
    expect(why).toContain("«Nhân vật» của Hồ sơ nhân vật là Bộ ảnh");
    expect(why).toContain("«Prompt» của Tạo video cần Chữ");
    expect(why).toContain("Bộ ảnh cắm được vào: ");
    expect(why).toContain("Dựng phim (Nhân vật, Không gian)");
    expect(why).toContain("Biên kịch (AI) (Nhân vật, Không gian)");
  });

  it("đầu ra chưa node nào nhận thì nói thẳng là chưa có", () => {
    const why = connectionProblem({ source: "f", sourceHandle: "storyboard", target: "v", targetHandle: "prompt" }, nodes);
    expect(why).toContain("Hiện chưa có node nào nhận Storyboard");
    expect(acceptersOf("storyboard")).toEqual([]);
  });

  it("video cắm được vào cổng Clip của Ghép phim và cổng Nối tiếp của Cảnh", () => {
    const why = connectionProblem({ source: "v", sourceHandle: "video", target: "f", targetHandle: "shots" }, nodes);
    expect(why).toContain("Video cắm được vào: Ghép phim (Clip); Cảnh (Nối tiếp)");
  });

  it("thả dây: tự đổi chiều khi kéo từ cổng vào; hai cổng cùng phía hoặc cùng node thì báo cách kéo", () => {
    const fromInput = droppedConnectionProblem({ nodeId: "v", id: "prompt", type: "target" }, { nodeId: "c", id: "character", type: "source" }, nodes);
    expect(fromInput).toContain("cần Chữ");
    expect(droppedConnectionProblem({ nodeId: "p", id: "text", type: "source" }, { nodeId: "c", id: "character", type: "source" }, nodes)).toContain(
      "Hai đầu đều là cổng ra",
    );
    expect(droppedConnectionProblem({ nodeId: "f", id: "video", type: "source" }, { nodeId: "f", id: "shots", type: "target" }, nodes)).toBe(
      "Không nối node vào chính nó",
    );
  });

  it("dây mang màu theo loại ở cổng ra, cả khi mở workflow đã lưu", () => {
    expect(edgeKindClass({ source: "c", sourceHandle: "character" }, nodes)).toBe("kind-imageset");
    const flow = toFlow({
      nodes: [
        { id: "p", type: "prompt", position: { x: 0, y: 0 }, params: {} },
        { id: "v", type: "generate-video", position: { x: 0, y: 0 }, params: {} },
      ],
      edges: [{ id: "e", source: "p", sourceHandle: "text", target: "v", targetHandle: "prompt" }],
    });
    expect(flow.edges[0]?.className).toBe("kind-text");
  });
});

describe("nối vào cổng nhận nhiều dây", () => {
  const edge = (id: string, source: string, target: string, targetHandle: string): Edge => ({ id, source, sourceHandle: "out", target, targetHandle });
  const existing = [edge("e1", "a", "t", "in"), edge("e2", "b", "t", "in"), edge("e3", "a", "t", "other"), edge("e4", "a", "u", "in")];
  const conn = { source: "c", sourceHandle: "out", target: "t", targetHandle: "in" };

  it("cổng thường: dây mới thay mọi dây cũ cùng cổng; các cổng khác giữ nguyên", () => {
    expect(replaceTargetEdges(existing, conn, false).map((e) => e.id)).toEqual(["e3", "e4"]);
  });

  it("cổng multiple: không lọc dây cũ", () => {
    expect(replaceTargetEdges(existing, conn, true)).toEqual(existing);
  });

  it("registry thật hiện chưa có cổng multiple: nối vào cổng Prompt vẫn thay dây cũ", () => {
    const toPrompt = { source: "p", sourceHandle: "text", target: "v", targetHandle: "prompt" };
    expect(connectionProblem(toPrompt, nodes)).toBeNull();
    expect(targetAcceptsMany(toPrompt, nodes)).toBe(false);
  });

  it("đường onConnect dùng: cổng multiple giữ cả hai dây, cổng thường thay dây cũ", () => {
    const defs = {
      sink: {
        definition: {
          inputs: [
            { name: "many", kind: "text" as const, label: "Nhiều", multiple: true },
            { name: "one", kind: "text" as const, label: "Một" },
          ],
        },
      },
    };
    const sinkNodes = [node("t", "sink"), node("a", "prompt"), node("b", "prompt")];
    const connect = (eds: Edge[], source: string, targetHandle: string): Edge[] => {
      const c = { source, sourceHandle: "out", target: "t", targetHandle };
      return [...replaceTargetEdges(eds, c, targetAcceptsMany(c, sinkNodes, defs)), { ...c, id: `${source}-${targetHandle}` }];
    };
    const many = connect(connect([], "a", "many"), "b", "many");
    expect(many.map((e) => e.id)).toEqual(["a-many", "b-many"]);
    const one = connect(connect([], "a", "one"), "b", "one");
    expect(one.map((e) => e.id)).toEqual(["b-one"]);
    expect(targetAcceptsMany({ source: "a", sourceHandle: "out", target: "t", targetHandle: "many" }, sinkNodes, defs)).toBe(true);
    expect(targetAcceptsMany({ source: "a", sourceHandle: "out", target: "t", targetHandle: "one" }, sinkNodes, defs)).toBe(false);
  });
});
