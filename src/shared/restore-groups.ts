import { orderSourceList } from "./source-order";
import type { WorkflowGraph, WorkflowGroup } from "./workflow";

// Khôi phục nhóm "Phân cảnh" bị mất: workflow có Ghép phim mà mọi node Cảnh cắm vào cổng Clip đều không thuộc nhóm nào (ví dụ một
// bản giao diện cũ chưa biết nhóm đã lưu đè, làm rơi `groups`). Hàm thuần; chỉ thêm nhóm, không đổi node, dây hay tham số, nên khoá cache
// và kết quả cũ giữ nguyên.
//
// `previous`: nhóm trong đồ thị của các lần chạy, mới nhất trước. Lần chạy nào có nhóm gồm đúng các cảnh đó thì lấy y nguyên nhóm ấy
// (giữ `source` để Thay/Giữ của Biên kịch vẫn đúng). Không có thì chỉ tạo nhóm mới "Phân cảnh" (cảnh theo thứ tự clip) khi mã node
// cho thấy đây từng là một nhóm: Ghép phim "combine-<g>" và mọi cảnh "scene-<g>-<n>" (cách mẫu, Biên kịch và bước chuyển workflow cũ
// đặt). Cảnh và Ghép phim người dùng tự thêm (mã theo thời gian) thì để yên: không có gì bị mất, không tự nhóm.
// Ghép phim mà một phần cảnh đã có nhóm thì để yên (không đoán).
export function restoreSceneGroups(graph: WorkflowGraph, previous: readonly (readonly WorkflowGroup[])[]): { graph: WorkflowGraph; restored: WorkflowGroup[] } {
  const groups = [...(graph.groups ?? [])];
  const grouped = new Set(groups.flatMap((g) => g.nodeIds));
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const restored: WorkflowGroup[] = [];

  for (const combine of graph.nodes.filter((n) => n.type === "film-combine")) {
    const wires = graph.edges.filter((e) => e.target === combine.id && e.targetHandle === "clips");
    const scenes = wires.filter((e) => byId.get(e.source)?.type === "scene");
    if (scenes.length === 0 || scenes.some((e) => grouped.has(e.source))) continue;
    const ordered = orderSourceList(scenes, combine.params.order, (id) => byId.get(id)?.position).map((e) => e.source);
    const members = new Set(ordered);
    const taken = (id: string) => groups.some((g) => g.id === id);

    const same = previous
      .flat()
      .find((g) => g.manual !== true && g.nodeIds.length === members.size && g.nodeIds.every((id) => members.has(id)) && !taken(g.id));
    const named = namedGroupId(combine.id, ordered);
    let group: WorkflowGroup;
    if (same) group = same;
    else if (named !== undefined) group = { id: taken(named) ? nextGroupId(taken) : named, label: "Phân cảnh", nodeIds: ordered };
    else continue;
    groups.push(group);
    restored.push(group);
    for (const id of group.nodeIds) grouped.add(id);
  }

  return restored.length === 0 ? { graph, restored } : { graph: { ...graph, groups }, restored };
}

// Mã nhóm suy từ mã node: Ghép phim "combine-<g>" và mọi cảnh "scene-<g>-<số>" → "<g>" (groupCombineId() tìm lại đúng Ghép phim).
// Không khớp kiểu đặt tên đó thì undefined.
function namedGroupId(combineId: string, sceneIds: readonly string[]): string | undefined {
  if (!combineId.startsWith("combine-")) return undefined;
  const g = combineId.slice("combine-".length);
  return g && sceneIds.every((id) => id.startsWith(`scene-${g}-`) && /^\d+$/.test(id.slice(`scene-${g}-`.length))) ? g : undefined;
}

function nextGroupId(taken: (id: string) => boolean): string {
  let k = 1;
  while (taken(`g${k}`)) k++;
  return `g${k}`;
}
