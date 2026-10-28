import type { Connection, Edge } from "@xyflow/react";
import { webNodes } from "../../../nodes/registry.web";
import { PORT_KIND_LABEL, type PortKind } from "../../../shared/ports";
import type { WorkflowGraph } from "../../../shared/workflow";
import type { FlowNode } from "./GraphNode";

// Dây mang màu theo loại dữ liệu ở cổng ra, khớp màu chấm cổng (styles.css: .kind-*).
export function edgeKindClass(edge: Pick<Edge, "source" | "sourceHandle">, nodes: Pick<FlowNode, "id" | "type">[]): string | undefined {
  const src = nodes.find((n) => n.id === edge.source);
  const kind = webNodes[src?.type ?? ""]?.definition.outputs.find((p) => p.name === edge.sourceHandle)?.kind;
  return kind ? `kind-${kind}` : undefined;
}

export function toFlow(graph: WorkflowGraph): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = graph.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: { params: n.params } }));
  return { nodes, edges: graph.edges.map((e) => ({ ...e, className: edgeKindClass(e, nodes) })) };
}

export function fromFlow(nodes: FlowNode[], edges: Edge[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "",
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      params: n.data.params,
    })),
    edges: edges
      .filter((e) => e.sourceHandle && e.targetHandle)
      .map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle!, target: e.target, targetHandle: e.targetHandle! })),
  };
}

// Những cổng vào (của mọi loại node) nhận được loại dữ liệu này — để gợi ý chỗ cắm đúng.
export function acceptersOf(kind: PortKind): string[] {
  return Object.values(webNodes)
    .map(({ definition }) => {
      const ports = definition.inputs.filter((p) => p.kind === kind).map((p) => p.label);
      return ports.length ? `${definition.label} (${ports.join(", ")})` : null;
    })
    .filter((s): s is string => s !== null);
}

function hintFor(kind: PortKind): string {
  const list = acceptersOf(kind);
  return list.length
    ? `${PORT_KIND_LABEL[kind]} cắm được vào: ${list.join("; ")}.`
    : `Hiện chưa có node nào nhận ${PORT_KIND_LABEL[kind]}.`;
}

// Cổng vào đã có dây thì nối mới sẽ THAY dây cũ (như ComfyUI), nên không tính là lỗi ở đây.
export function connectionProblem(conn: Connection | Edge, nodes: FlowNode[]): string | null {
  const src = nodes.find((n) => n.id === conn.source);
  const dst = nodes.find((n) => n.id === conn.target);
  if (!src || !dst) return "Không tìm thấy node ở một đầu dây";
  if (src.id === dst.id) return "Không nối node vào chính nó";
  const srcDef = webNodes[src.type ?? ""]?.definition;
  const dstDef = webNodes[dst.type ?? ""]?.definition;
  const out = srcDef?.outputs.find((p) => p.name === conn.sourceHandle);
  const inp = dstDef?.inputs.find((p) => p.name === conn.targetHandle);
  if (!srcDef || !dstDef || !out || !inp) return "Cổng không tồn tại";
  if (out.kind !== inp.kind) {
    return (
      `Không nối được: cổng ra «${out.label}» của ${srcDef.label} là ${PORT_KIND_LABEL[out.kind]}, ` +
      `còn cổng vào «${inp.label}» của ${dstDef.label} cần ${PORT_KIND_LABEL[inp.kind]}. ${hintFor(out.kind)}`
    );
  }
  return null;
}

type HandleEnd = { nodeId: string; id?: string | null; type: "source" | "target" };

// Người dùng thả dây lên một cổng mà React Flow không cho nối: dựng lại đúng chiều rồi giải thích vì sao.
export function droppedConnectionProblem(from: HandleEnd, to: HandleEnd, nodes: FlowNode[]): string {
  if (from.nodeId === to.nodeId) return "Không nối node vào chính nó";
  if (from.type === to.type) {
    return from.type === "source"
      ? "Hai đầu đều là cổng ra. Kéo từ cổng ra (chấm bên phải) sang cổng vào (chấm bên trái) của node khác."
      : "Hai đầu đều là cổng vào. Kéo từ cổng ra (chấm bên phải) sang cổng vào (chấm bên trái) của node khác.";
  }
  const [s, t] = from.type === "source" ? [from, to] : [to, from];
  const conn: Connection = { source: s.nodeId, sourceHandle: s.id ?? null, target: t.nodeId, targetHandle: t.id ?? null };
  return connectionProblem(conn, nodes) ?? "Không nối được hai cổng này";
}
