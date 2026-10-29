import type { WorkflowGraph } from "../shared/workflow";
import type { PlannedNode } from "./executor";

// Tên node cho người đọc, dùng chung cho bảng ước tính, thông báo lỗi và lý do bỏ qua của lần chạy:
// Cảnh trong nhóm theo số thứ tự ("Cảnh 3"), node có tên thì kèm tên ("Nhân vật: Mai"), còn lại là nhãn loại node.
// Một nơi duy nhất để 12 cảnh lỗi không còn cùng mang tên "Cảnh".
export function labelOf(p: PlannedNode, graph: WorkflowGraph): string {
  const base = p.impl.definition.label;
  const group = graph.groups?.find((g) => g.nodeIds.includes(p.node.id));
  if (group) return `${base} ${group.nodeIds.indexOf(p.node.id) + 1}`;
  const name = p.params && typeof p.params === "object" ? (p.params as { name?: unknown }).name : undefined;
  return typeof name === "string" && name.trim() ? `${base}: ${name.trim()}` : base;
}
