import { isSceneGroup, type WorkflowGraph } from "./workflow";

// Tên node cho người đọc, dùng chung cho bảng ước tính, thông báo lỗi, lý do bỏ qua của lần chạy và nhãn thẻ trên canvas:
// Cảnh trong nhóm theo số thứ tự ("Cảnh 3"), node có tên thì kèm tên ("Nhân vật: Mai"), còn lại là nhãn loại node.
// Một nơi duy nhất để 12 cảnh lỗi không còn cùng mang tên "Cảnh".
export function labelOf(node: { id: string; params: unknown }, baseLabel: string, graph: Pick<WorkflowGraph, "groups">): string {
  const group = graph.groups?.find((g) => isSceneGroup(g) && g.nodeIds.includes(node.id));
  if (group) return `${baseLabel} ${group.nodeIds.indexOf(node.id) + 1}`;
  const name = node.params && typeof node.params === "object" ? (node.params as { name?: unknown }).name : undefined;
  return typeof name === "string" && name.trim() ? `${baseLabel}: ${name.trim()}` : baseLabel;
}
