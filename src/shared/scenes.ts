import type { Shot } from "./director";
import { sha256Hex, stableStringify } from "./hash";
import { PROVIDER_IDS, type ProviderId } from "./providers";
import type { WorkflowEdge, WorkflowGraph, WorkflowGroup, WorkflowNode } from "./workflow";

// Nhóm "Phân cảnh": danh sách cảnh → các node Cảnh xếp lưới, nối sẵn Nhân vật/Không gian/Đồ vật, dây Nối tiếp cho cảnh
// "chain", và một node Ghép phim nhận clip theo đúng thứ tự. Hàm thuần, dùng cho Biên kịch (lúc chạy và nút Tạo thẻ cảnh),
// chuyển workflow cũ và mẫu.

export const SCENE_GRID = { cols: 6, width: 230, height: 250 } as const;

export const SCENES_EDITED_MESSAGE = "Biên kịch ra bộ cảnh mới nhưng thẻ cảnh đã được sửa tay — chọn Thay hoặc Giữ";

const REF_PORTS = ["character", "location", "props"] as const;
type RefPort = (typeof REF_PORTS)[number];

export type ExpandScenesArgs = {
  writerId?: string;
  groupId?: string;
  shots: Shot[];
  // Mã node nguồn; cổng ra của node Nhân vật/Không gian/Đồ vật trùng tên cổng vào của Cảnh.
  refs: Partial<Record<RefPort, string>>;
  provider: ProviderId;
  resultKey?: string;
  origin: { x: number; y: number };
};

const groupsOf = (graph: WorkflowGraph): WorkflowGroup[] => graph.groups ?? [];
const groupOf = (graph: WorkflowGraph, groupId: string) => groupsOf(graph).find((g) => g.id === groupId);

// Node Ghép phim của nhóm: node film-combine nhận clip của một cảnh trong nhóm; nhóm chưa có cảnh (Biên kịch chưa có
// kết quả) thì là node `combine-<groupId>` mà expandScenes đã tạo.
export function groupCombineId(graph: WorkflowGraph, groupId: string): string | undefined {
  const members = new Set(groupOf(graph, groupId)?.nodeIds ?? []);
  const types = new Map(graph.nodes.map((n) => [n.id, n.type]));
  const wired = graph.edges.find((e) => members.has(e.source) && e.sourceHandle === "clip" && e.targetHandle === "clips" && types.get(e.target) === "film-combine");
  if (wired) return wired.target;
  const named = `combine-${groupId}`;
  return types.get(named) === "film-combine" ? named : undefined;
}

// Ảnh chụp nhóm: tham số từng cảnh theo thứ tự nhóm (không có toạ độ) và các dây chạm vào cảnh trong nhóm (không có mã dây).
// Kéo node, đổi thứ tự node/dây trong mảng hay vẽ lại một dây y hệt đều không đổi ảnh chụp; sửa chữ, dây, thêm/xoá cảnh thì đổi.
export function snapshotGroup(graph: WorkflowGraph, groupId: string): string {
  const group = groupOf(graph, groupId);
  if (!group) throw new Error(`Không có nhóm "${groupId}" trong workflow`);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const members = new Set(group.nodeIds);
  const nodes = group.nodeIds.map((id) => {
    const n = byId.get(id);
    // Qua JSON để trường undefined (mất khi lưu) không làm khác ảnh chụp.
    return n ? { id, type: n.type, params: JSON.parse(JSON.stringify(n.params)) as unknown } : { id, missing: true };
  });
  const edges = graph.edges
    .filter((e) => members.has(e.source) || members.has(e.target))
    .map((e) => `${e.source}.${e.sourceHandle}>${e.target}.${e.targetHandle}`)
    .sort();
  return sha256Hex(stableStringify({ nodes, edges }));
}

// Nhóm sinh từ Biên kịch đã bị sửa tay kể từ lần tạo. Nhóm tạo tay (không có source) thì không bao giờ.
export function groupEdited(graph: WorkflowGraph, groupId: string): boolean {
  const source = groupOf(graph, groupId)?.source;
  return source !== undefined && snapshotGroup(graph, groupId) !== source.snapshot;
}

function newGroupId(graph: WorkflowGraph): string {
  const taken = (id: string) => groupsOf(graph).some((g) => g.id === id) || graph.nodes.some((n) => n.id === `combine-${id}` || n.id.startsWith(`scene-${id}-`));
  let k = 1;
  while (taken(`g${k}`)) k++;
  return `g${k}`;
}

export function expandScenes(graph: WorkflowGraph, a: ExpandScenesArgs): { graph: WorkflowGraph; groupId: string; combineId: string } {
  const groupId = a.groupId ?? newGroupId(graph);
  const old = groupOf(graph, groupId);
  const oldIds = new Set(old?.nodeIds ?? []);
  const reuse = groupCombineId(graph, groupId);

  const kept = graph.nodes.filter((n) => !oldIds.has(n.id));
  const ids = a.shots.map((_, i) => `scene-${groupId}-${i + 1}`);
  let combineId = reuse ?? `combine-${groupId}`;
  for (let k = 2; !reuse && kept.some((n) => n.id === combineId); k++) combineId = `combine-${groupId}-${k}`;
  const clash = ids.find((id) => kept.some((n) => n.id === id));
  if (clash) throw new Error(`Mã node "${clash}" đã có trong workflow nhưng không thuộc nhóm "${groupId}" — không tạo được thẻ cảnh`);

  const { cols, width, height } = SCENE_GRID;
  const scenes: WorkflowNode[] = a.shots.map((s, i) => ({
    id: ids[i]!,
    type: "scene",
    position: { x: a.origin.x + (i % cols) * width, y: a.origin.y + Math.floor(i / cols) * height },
    params: { size: s.size, angle: s.angle, move: s.move, subject: s.subject, start: s.start, motion: s.motion, props: s.props, provider: a.provider },
  }));

  const edges: WorkflowEdge[] = [];
  const wire = (source: string, sourceHandle: string, target: string, targetHandle: string) =>
    edges.push({ id: `e-${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle });
  ids.forEach((id, i) => {
    for (const port of REF_PORTS) {
      const ref = a.refs[port];
      if (ref) wire(ref, port, id, port);
    }
    if (a.shots[i]!.link === "chain" && i > 0) wire(ids[i - 1]!, "clip", id, "follow");
    wire(id, "clip", combineId, "clips");
  });

  // Ghép phim cũ giữ vị trí và bù sáng; thứ tự: các cảnh mới trước, nguồn khác (không thuộc nhóm) giữ thứ tự cũ phía sau.
  const existing = kept.find((n) => n.id === combineId);
  const prevOrder = Array.isArray(existing?.params.order) ? (existing.params.order as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const order = [...ids, ...prevOrder.filter((id) => !oldIds.has(id) && !ids.includes(id) && kept.some((n) => n.id === id))];
  const combine: WorkflowNode = existing
    ? { ...existing, params: { ...existing.params, order } }
    : { id: combineId, type: "film-combine", position: { x: a.origin.x + cols * width + 80, y: a.origin.y }, params: { fixBrightness: true, order } };

  const group: WorkflowGroup = { id: groupId, label: old?.label ?? "Phân cảnh", nodeIds: ids };
  const next: WorkflowGraph = {
    nodes: [...(existing ? kept.map((n) => (n.id === combineId ? combine : n)) : kept), ...scenes, ...(existing ? [] : [combine])],
    edges: [...graph.edges.filter((e) => !oldIds.has(e.source) && !oldIds.has(e.target)), ...edges],
    groups: old ? groupsOf(graph).map((g) => (g.id === groupId ? group : g)) : [...groupsOf(graph), group],
  };
  if (a.writerId !== undefined) group.source = { writerId: a.writerId, resultKey: a.resultKey ?? "", snapshot: snapshotGroup(next, groupId) };
  return { graph: next, groupId, combineId };
}

// Các nhóm sinh từ một Biên kịch.
export function writerGroups(graph: WorkflowGraph, writerId: string): WorkflowGroup[] {
  return groupsOf(graph).filter((g) => g.source?.writerId === writerId);
}

// Phụ thuộc ngầm (không có dây): mọi cảnh trong nhóm sinh từ Biên kịch, cùng Ghép phim của nhóm, chờ Biên kịch đó xong,
// vì Biên kịch xong có thể tạo lại cả nhóm. Trả mã node → các Biên kịch phải chờ.
export function writerWaits(graph: WorkflowGraph): Map<string, string[]> {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const waits = new Map<string, string[]>();
  for (const g of groupsOf(graph)) {
    const writerId = g.source?.writerId;
    if (writerId === undefined || !ids.has(writerId)) continue;
    const combineId = groupCombineId(graph, g.id);
    for (const id of [...g.nodeIds, ...(combineId ? [combineId] : [])]) {
      if (!ids.has(id) || id === writerId) continue;
      const list: string[] = waits.get(id) ?? [];
      if (!list.includes(writerId)) waits.set(id, [...list, writerId]);
    }
  }
  return waits;
}

// Nhóm theo kết quả (mới) của Biên kịch: có groupId thì tạo lại nhóm đó, giữ tham chiếu/dịch vụ/vị trí như các cảnh đang có;
// không có groupId, hoặc nhóm rỗng, thì lấy theo dây của Biên kịch: Nhân vật/Không gian nối vào Biên kịch, node Đồ vật
// nhận danh sách từ Biên kịch, dịch vụ của Biên kịch, đặt bên phải Biên kịch.
export function rebuildWriterGroup(
  graph: WorkflowGraph,
  a: { writerId: string; groupId?: string; shots: Shot[]; resultKey: string },
): { graph: WorkflowGraph; groupId: string; combineId: string } {
  const { writerId, groupId, shots, resultKey } = a;
  const group = groupId === undefined ? undefined : groupOf(graph, groupId);
  if (groupId !== undefined && group?.source?.writerId !== writerId) throw new Error(`Nhóm "${groupId}" không sinh từ Biên kịch "${writerId}"`);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const writer = byId.get(writerId);
  if (!writer) throw new Error(`Không có Biên kịch "${writerId}" trong workflow`);
  const members = (group?.nodeIds ?? []).map((id) => byId.get(id)).filter((n): n is WorkflowNode => n !== undefined);
  const memberIds = new Set(members.map((n) => n.id));

  const refs: ExpandScenesArgs["refs"] = {};
  for (const port of REF_PORTS) {
    const fromScene = graph.edges.find((e) => memberIds.has(e.target) && e.targetHandle === port)?.source;
    const fromWriter =
      port === "props"
        ? graph.edges.find((e) => e.source === writerId && e.sourceHandle === "props" && e.targetHandle === "spec" && byId.get(e.target)?.type === "props")?.target
        : graph.edges.find((e) => e.target === writerId && e.targetHandle === port)?.source;
    const ref = fromScene ?? fromWriter;
    if (ref) refs[port] = ref;
  }

  const providerOf = (n: WorkflowNode | undefined) => PROVIDER_IDS.find((p) => p === n?.params.provider);
  const provider = providerOf(members[0]) ?? providerOf(writer);
  if (!provider) throw new Error(`Không biết dùng dịch vụ nào cho thẻ cảnh của Biên kịch "${writerId}"`);
  const origin = members.length
    ? { x: Math.min(...members.map((n) => n.position.x)), y: Math.min(...members.map((n) => n.position.y)) }
    : { x: writer.position.x + 460, y: writer.position.y };
  return expandScenes(graph, { writerId, ...(groupId === undefined ? {} : { groupId }), shots, refs, provider, resultKey, origin });
}

// "Giữ": giữ các thẻ đang có, chỉ ghi nhận kết quả mới của Biên kịch. Ảnh chụp giữ nguyên bản lúc tạo: "Giữ" không phải
// một lần tạo, nên thẻ vẫn tính là đã sửa tay — Biên kịch ra kết quả khác nữa thì lại dừng hỏi (spec mục 5.4).
export function keepWriterGroup(graph: WorkflowGraph, groupId: string, resultKey: string): WorkflowGraph {
  const group = groupOf(graph, groupId);
  if (!group?.source) throw new Error(`Nhóm "${groupId}" không sinh từ Biên kịch`);
  const source = { ...group.source, resultKey };
  return { ...graph, groups: groupsOf(graph).map((g) => (g.id === groupId ? { ...g, source } : g)) };
}
