import type { SourceRef } from "../shared/node-definition";
import type { WorkflowGraph } from "../shared/workflow";
import type { PlannedNode } from "./executor";

export type PreflightError = { nodeId: string; message: string };

// Kiểm luật trước khi chạy: luật chung (một nguồn không cắm hai lần vào cùng cổng nhiều dây) và preflight()
// của từng node trong phạm vi chạy. Executor gọi trước node đầu tiên, nên lỗi ở đây chưa tốn lượt dịch vụ nào.
// `order` là orderSources() của executor (truyền vào để file này không import ngược executor lúc chạy).
export function preflightErrors(
  scoped: readonly PlannedNode[],
  planned: ReadonlyMap<string, PlannedNode>,
  graph: WorkflowGraph,
  order: (p: PlannedNode, port: string) => SourceRef[],
): PreflightError[] {
  const sources = (nodeId: string, port: string): SourceRef[] => {
    const p = planned.get(nodeId);
    if (!p) return [];
    const def = p.impl.definition.inputs.find((x) => x.name === port);
    return def?.multiple ? order(p, port) : [...(p.inputs.get(port) ?? [])];
  };

  const errors: PreflightError[] = [];
  for (const p of scoped) {
    const def = p.impl.definition;
    const add = (message: string) => errors.push({ nodeId: p.node.id, message: `Node "${def.label}" (${p.node.id}): ${message}` });
    for (const port of def.inputs) {
      if (!port.multiple) continue;
      const seen = new Set<string>();
      const reported = new Set<string>();
      for (const w of p.inputs.get(port.name) ?? []) {
        const k = `${w.source}:${w.sourceHandle}`;
        if (seen.has(k) && !reported.has(k)) {
          add(`cổng "${port.label}" có hai dây từ cùng cổng "${w.sourceHandle}" của node "${w.source}" — mỗi nguồn chỉ được dùng một lần`);
          reported.add(k);
        }
        seen.add(k);
      }
    }
    for (const message of def.preflight?.({ node: p, graph, planned, sources }) ?? []) add(message);
  }
  return errors;
}
