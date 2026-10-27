import type { Connection, Edge } from "@xyflow/react";
import { webNodes } from "../../../nodes/registry.web";
import type { WorkflowGraph } from "../../../shared/workflow";
import type { FlowNode } from "./GraphNode";

export function toFlow(graph: WorkflowGraph): { nodes: FlowNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: { params: n.params } })),
    edges: graph.edges.map((e) => ({ ...e })),
  };
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

export function connectionProblem(conn: Connection | Edge, nodes: FlowNode[], edges: Edge[]): string | null {
  const src = nodes.find((n) => n.id === conn.source);
  const dst = nodes.find((n) => n.id === conn.target);
  if (!src || !dst || src.id === dst.id) return "Không nối node vào chính nó";
  const out = webNodes[src.type ?? ""]?.definition.outputs.find((p) => p.name === conn.sourceHandle);
  const inp = webNodes[dst.type ?? ""]?.definition.inputs.find((p) => p.name === conn.targetHandle);
  if (!out || !inp) return "Cổng không tồn tại";
  if (out.kind !== inp.kind) return `Không nối ${out.kind} vào ${inp.kind}`;
  if (edges.some((e) => e.target === conn.target && e.targetHandle === conn.targetHandle)) return "Cổng này đã có dây nối";
  return null;
}
