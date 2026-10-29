import { labelOf as sharedLabelOf } from "../shared/node-label";
import type { WorkflowGraph } from "../shared/workflow";
import type { PlannedNode } from "./executor";

// Tên node của lần chạy: cách đặt tên nằm ở src/shared/node-label.ts (giao diện dùng chung); ở đây chỉ chuyển PlannedNode sang dạng nó cần.
export function labelOf(p: PlannedNode, graph: WorkflowGraph): string {
  return sharedLabelOf({ id: p.node.id, params: p.params }, p.impl.definition.label, graph);
}
