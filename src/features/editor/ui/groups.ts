import type { Edge } from "@xyflow/react";
import { fmtSec } from "../../../shared/card-line";
import { PORT_KINDS, type PortKind } from "../../../shared/ports";
import { isSceneGroup, type WorkflowGroup } from "../../../shared/workflow";
import type { FlowNode, FrameInfo } from "./GraphNode";
import { cardWidthOf } from "./new-node";

// Khung nhóm trên canvas: mỗi nhóm (Phân cảnh hoặc nhóm tay) một node "group-frame" bao quanh các thẻ thành viên.
// Khung chỉ sinh ra để vẽ, từ nodes + groups + kích thước đo được, mỗi lần vẽ: không nằm trong state của canvas và không
// bao giờ vào dữ liệu lưu (fromFlow() bỏ node loại này). Toàn hàm thuần.

export const GROUP_FRAME_TYPE = "group-frame";
export const FRAME_PADDING = 30;
export const FRAME_TITLE_HEIGHT = 40;
// Chiều cao tạm của thẻ chưa được xyflow đo.
export const DEFAULT_CARD_HEIGHT = 200;
// Phần tử gắn vào khung mà người kéo cầm: chỉ kéo tiêu đề mới dời cả nhóm (thân khung để trống cho thao tác trên nền canvas).
export const FRAME_DRAG_HANDLE = ".group-title";

export const frameIdOf = (groupId: string): string => `frame-${groupId}`;
export const isFrame = (n: { type?: string }): boolean => n.type === GROUP_FRAME_TYPE;

export type Size = { w: number; h: number };
export type DirectorWarning = { nodeId: string; message: string };

// Kích thước thẻ: số xyflow đã đo, chưa đo thì bề rộng theo loại node và chiều cao tạm.
export function measuredFrom(nodes: readonly FlowNode[]): (id: string) => Size {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (id) => {
    const n = byId.get(id);
    return { w: n?.measured?.width ?? cardWidthOf(n?.type), h: n?.measured?.height ?? DEFAULT_CARD_HEIGHT };
  };
}

export type FrameExtra = {
  // Giây của clip một thành viên (nếu đã biết). Tiêu đề chỉ ghi tổng khi MỌI thành viên đều có số.
  secondsOf?: (nodeId: string) => number | undefined;
  // Cảnh báo luật đạo diễn của estimate (Task 7 truyền vào). Không truyền thì khung không có dòng kiểm luật nào:
  // không ghi "✓" khi chưa kiểm. Chỉ nhóm Phân cảnh có dòng này.
  warnings?: readonly DirectorWarning[];
  // Mã khung đang được chọn.
  selected?: ReadonlySet<string>;
  // Dây đang hiển thị (từ bundleEdges): khung vẽ một cổng vào cho mỗi loại dây gộp tới nó.
  edges?: readonly Edge[];
};

const RULE_OK = "✓ Luật đạo diễn đạt";

export function groupTitle(group: Pick<WorkflowGroup, "label" | "manual">, count: number, seconds: number | undefined): string {
  const unit = isSceneGroup(group) ? "cảnh" : "node";
  const label = group.label.trim() || "Nhóm";
  return `▢ ${label} · ${count} ${unit}${seconds !== undefined && seconds > 0 ? ` · ${fmtSec(seconds)}` : ""}`;
}

export function groupFrames(nodes: readonly FlowNode[], groups: readonly WorkflowGroup[], measured: (id: string) => Size, extra: FrameExtra = {}): FlowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const frames: FlowNode[] = [];
  for (const g of groups) {
    const members = g.nodeIds.map((id) => byId.get(id)).filter((n): n is FlowNode => n !== undefined && !isFrame(n));
    if (members.length === 0) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of members) {
      const { w, h } = measured(n.id);
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }

    let seconds: number | undefined;
    if (extra.secondsOf) {
      const each = members.map((n) => extra.secondsOf!(n.id));
      if (each.every((s): s is number => s !== undefined)) seconds = each.reduce((a, b) => a + b, 0);
    }
    const scene = isSceneGroup(g);
    let rule: FrameInfo["rule"];
    if (scene && extra.warnings) {
      const ids = new Set(members.map((n) => n.id));
      const lines = extra.warnings.filter((w) => ids.has(w.nodeId)).map((w) => w.message);
      rule = lines.length === 0 ? { ok: true, lines: [RULE_OK] } : { ok: false, lines };
    }
    const id = frameIdOf(g.id);
    const inKinds = [...new Set((extra.edges ?? []).filter((e) => e.target === id).map((e) => e.targetHandle?.replace(/^in-/, "")))].filter(
      (k): k is PortKind => (PORT_KINDS as readonly (string | undefined)[]).includes(k),
    );
    const width = maxX - minX + FRAME_PADDING * 2;
    const height = maxY - minY + FRAME_PADDING * 2 + FRAME_TITLE_HEIGHT;
    const frame: FrameInfo = { groupId: g.id, title: groupTitle(g, members.length, seconds), count: members.length, scene, inKinds, ...(rule ? { rule } : {}) };
    frames.push({
      id,
      type: GROUP_FRAME_TYPE,
      position: { x: minX - FRAME_PADDING, y: minY - FRAME_PADDING - FRAME_TITLE_HEIGHT },
      width,
      height,
      // Khung không nằm trong state nên không nhận được số đo xyflow báo về: tự khai kích thước đã biết (thiếu thì kéo khung báo "node chưa khởi tạo").
      measured: { width, height },
      zIndex: -1,
      selectable: true,
      deletable: false,
      connectable: false,
      dragHandle: FRAME_DRAG_HANDLE,
      selected: extra.selected?.has(id) ?? false,
      // Thân khung không bắt chuột (kéo nền canvas xuyên qua khung được); chỉ tiêu đề bắt (styles.css .group-title).
      // zIndex cố định trong style: xyflow nâng node đang chọn thêm ~1000, khung được chọn sẽ đè lên các thẻ nếu không ghi đè ở đây.
      style: { pointerEvents: "none", zIndex: -1 },
      data: { params: {}, frame },
    });
  }
  return frames;
}

const sameFrame = (a: FlowNode, b: FlowNode): boolean =>
  a.position.x === b.position.x &&
  a.position.y === b.position.y &&
  a.width === b.width &&
  a.height === b.height &&
  a.selected === b.selected &&
  JSON.stringify(a.data) === JSON.stringify(b.data);

// Vẽ lại mà khung không đổi thì giữ đúng đối tượng cũ: kéo một thẻ ngoài nhóm không bắt khung nào vẽ lại.
export function reuseFrames(prev: readonly FlowNode[], next: FlowNode[]): FlowNode[] {
  const old = new Map(prev.map((f) => [f.id, f]));
  const out = next.map((f) => {
    const was = old.get(f.id);
    return was && sameFrame(was, f) ? was : f;
  });
  return out.length === prev.length && out.every((f, i) => f === prev[i]) ? (prev as FlowNode[]) : out;
}

const KIND_CLASS = /(?:^|\s)kind-([a-z]+)(?:\s|$)/;
const kindOfEdge = (e: Edge): PortKind | undefined => {
  const kind = e.className?.match(KIND_CLASS)?.[1];
  return (PORT_KINDS as readonly (string | undefined)[]).includes(kind) ? (kind as PortKind) : undefined;
};

// Dây từ một nguồn NGOÀI nhóm vào từ 2 node trở lên trong cùng nhóm, cùng cổng ra, vẽ gộp thành một dây tới cổng `in-<loại>`
// ở mép khung (loại = loại dữ liệu của cổng ra, qua màu `kind-*` của dây). Chỉ đổi cách vẽ: `bundled` là các dây gốc bị
// thay (vẫn nằm nguyên trong dữ liệu và trong bản lưu), `visible` là mọi dây để vẽ = dây không bị gộp + dây gộp.
// Dây có nguồn trong nhóm (Nối tiếp giữa các cảnh, clip → Ghép phim) không bao giờ bị gộp. Dây gộp không chọn được, không xoá được.
export function bundleEdges(edges: readonly Edge[], groups: readonly WorkflowGroup[]): { visible: Edge[]; bundled: Edge[] } {
  const hidden = new Set<Edge>();
  const made: Edge[] = [];
  for (const g of groups) {
    const members = new Set(g.nodeIds);
    const buckets = new Map<string, Edge[]>();
    for (const e of edges) {
      if (hidden.has(e) || !e.sourceHandle || !members.has(e.target) || members.has(e.source)) continue;
      const key = `${e.source}\u0000${e.sourceHandle}`;
      buckets.set(key, [...(buckets.get(key) ?? []), e]);
    }
    for (const list of buckets.values()) {
      const first = list[0]!;
      const kind = kindOfEdge(first);
      if (list.length < 2 || !kind) continue;
      for (const e of list) hidden.add(e);
      made.push({
        id: `bundle-${g.id}-${first.source}-${first.sourceHandle}`,
        source: first.source,
        sourceHandle: first.sourceHandle!,
        target: frameIdOf(g.id),
        targetHandle: `in-${kind}`,
        className: `kind-${kind}`,
        label: `×${list.length}`,
        deletable: false,
        selectable: false,
        focusable: false,
      });
    }
  }
  return { visible: [...edges.filter((e) => !hidden.has(e)), ...made], bundled: edges.filter((e) => hidden.has(e)) };
}

// Dời mọi thành viên của nhóm cùng một đoạn. Node ngoài nhóm giữ nguyên đối tượng cũ.
export function moveGroup(nodes: FlowNode[], groups: readonly WorkflowGroup[], groupId: string, dx: number, dy: number): FlowNode[] {
  const members = new Set(groups.find((g) => g.id === groupId)?.nodeIds ?? []);
  if ((dx === 0 && dy === 0) || members.size === 0) return nodes;
  return nodes.map((n) => (members.has(n.id) && !isFrame(n) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n));
}

// Kéo nhiều khung cùng lúc (khung và khung chung thẻ thành viên): mỗi thẻ chỉ dời MỘT lần, theo đoạn dời của khung đứng trước
// trong `groups`, không cộng dồn qua từng khung.
export function moveFramesTo(nodes: FlowNode[], groups: readonly WorkflowGroup[], targets: ReadonlyMap<string, { x: number; y: number }>): FlowNode[] {
  const measured = measuredFrom(nodes);
  const delta = new Map<string, { dx: number; dy: number }>();
  for (const g of groups) {
    const to = targets.get(g.id);
    const frame = to ? groupFrames(nodes, [g], measured)[0] : undefined;
    if (!to || !frame) continue;
    for (const id of g.nodeIds) if (!delta.has(id)) delta.set(id, { dx: to.x - frame.position.x, dy: to.y - frame.position.y });
  }
  return nodes.map((n) => {
    const d = isFrame(n) ? undefined : delta.get(n.id);
    return d && (d.dx !== 0 || d.dy !== 0) ? { ...n, position: { x: n.position.x + d.dx, y: n.position.y + d.dy } } : n;
  });
}

// Nhóm tay từ các node đang chọn (Ctrl+G): không có `source`, có `manual`, nên chỉ là khung nhìn.
export function addManualGroup(groups: readonly WorkflowGroup[], nodeIds: readonly string[]): WorkflowGroup[] {
  let k = 1;
  while (groups.some((g) => g.id === `manual-${k}`)) k++;
  return [...groups, { id: `manual-${k}`, label: `Nhóm ${k}`, nodeIds: [...nodeIds], manual: true }];
}

// Node bị xoá thì rút khỏi nhóm tay, nhóm tay hết node thì bỏ. Nhóm Phân cảnh không đụng tới (xoá cảnh là sửa tay nhóm, ảnh chụp ghi nhận).
export function pruneManualGroups(groups: WorkflowGroup[], removed: ReadonlySet<string>): WorkflowGroup[] {
  let changed = false;
  const out: WorkflowGroup[] = [];
  for (const g of groups) {
    if (isSceneGroup(g) || !g.nodeIds.some((id) => removed.has(id))) {
      out.push(g);
      continue;
    }
    changed = true;
    const nodeIds = g.nodeIds.filter((id) => !removed.has(id));
    if (nodeIds.length > 0) out.push({ ...g, nodeIds });
  }
  return changed ? out : groups;
}

// Node bị xoá thì các dây chạm vào nó cũng phải bỏ khỏi dữ liệu. xyflow chỉ biết các dây đang VẼ; dây gốc bị gộp vào mép khung
// không được vẽ nên không tự bị xoá theo, để lại dây trỏ tới node không còn (lần chạy sau báo lỗi, người dùng không thấy để xoá).
export function pruneEdgesFor(edges: Edge[], removed: ReadonlySet<string>): Edge[] {
  return edges.some((e) => removed.has(e.source) || removed.has(e.target)) ? edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)) : edges;
}
