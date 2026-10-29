import type { PreflightCtx, SourceRef } from "../shared/node-definition";
import type { WorkflowGraph } from "../shared/workflow";
import type { PlannedNode } from "./executor";

export type PreflightError = { nodeId: string; message: string };

type SourceOrder = (p: PlannedNode, port: string) => SourceRef[];

// Dây vào một cổng của node đã lập kế hoạch; cổng `multiple` theo đúng thứ tự node sẽ nhận khi chạy.
function sourcesOf(planned: ReadonlyMap<string, PlannedNode>, order: SourceOrder) {
  return (nodeId: string, port: string): SourceRef[] => {
    const p = planned.get(nodeId);
    if (!p) return [];
    const def = p.impl.definition.inputs.find((x) => x.name === port);
    return def?.multiple ? order(p, port) : [...(p.inputs.get(port) ?? [])];
  };
}

// Kiểm luật trước khi chạy: luật chung (một nguồn không cắm hai lần vào cùng cổng nhiều dây) và preflight()
// của từng node trong phạm vi chạy. Executor gọi trước node đầu tiên, nên lỗi ở đây chưa tốn lượt dịch vụ nào.
// `order` là orderSources() của executor (truyền vào để file này không import ngược executor lúc chạy).
export function preflightErrors(
  scoped: readonly PlannedNode[],
  planned: ReadonlyMap<string, PlannedNode>,
  graph: WorkflowGraph,
  order: SourceOrder,
): PreflightError[] {
  const sources = sourcesOf(planned, order);

  const errors: PreflightError[] = [];
  for (const p of scoped) {
    const def = p.impl.definition;
    const add = (message: string, nodeId = p.node.id) => errors.push({ nodeId, message: `Node "${def.label}" (${p.node.id}): ${message}` });
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
    for (const issue of def.preflight?.({ node: p, graph, planned, sources }) ?? []) {
      if (typeof issue === "string") add(issue);
      else add(issue.message, issue.nodeId);
    }
  }
  return errors;
}

// Cảnh báo (không chặn chạy) của các node trong phạm vi: definition.warnings(), gắn vào đúng node liên quan.
export function nodeWarnings(
  scoped: readonly PlannedNode[],
  planned: ReadonlyMap<string, PlannedNode>,
  graph: WorkflowGraph,
  order: SourceOrder,
): PreflightError[] {
  const sources = sourcesOf(planned, order);
  const ctx = (p: PlannedNode): PreflightCtx => ({ node: p, graph, planned, sources });
  return scoped.flatMap((p) =>
    (p.impl.definition.warnings?.(ctx(p)) ?? []).map((w): PreflightError => (typeof w === "string" ? { nodeId: p.node.id, message: w } : w)),
  );
}
