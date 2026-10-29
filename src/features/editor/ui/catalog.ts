import { webNodes } from "../../../nodes/registry.web";
import type { AssetSummary } from "../../../shared/api";
import type { PortDef, PortKind } from "../../../shared/ports";
import { WORKFLOW_TEMPLATES } from "../../../shared/templates";
import { iconOf } from "./NodeCard";

// Danh mục của ô tìm node (Spotlight): hàm thuần, không đụng giao diện hay localStorage.
// "Gần đây" là nhóm ảo (lấy từ localStorage), không mục nào có category này.
export const CATEGORIES = [
  { id: "gan-day", label: "Gần đây" },
  { id: "co-ban", label: "Cơ bản" },
  { id: "nguon-kho", label: "Nguồn & kho" },
  { id: "tham-chieu", label: "Tham chiếu" },
  { id: "tao-video", label: "Tạo video" },
  { id: "chu-ai", label: "Chữ & AI" },
  { id: "xu-ly-video", label: "Xử lý video" },
  { id: "mau", label: "Mẫu" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export type ItemCategory = Exclude<CategoryId, "gan-day">;

// Node thuộc nhóm nào; loại node chưa khai báo ở đây rơi vào "Cơ bản" (vẫn thấy được, không mất).
const NODE_CATEGORY: Record<string, ItemCategory> = {
  prompt: "co-ban",
  character: "tham-chieu",
  location: "tham-chieu",
  props: "tham-chieu",
  scene: "tao-video",
  "generate-video": "tao-video",
  writer: "chu-ai",
  "film-combine": "xu-ly-video",
};

export type CatalogItem = {
  key: string;
  category: ItemCategory;
  icon: string;
  label: string;
  description: string;
  // Mục tạo node: loại node. Mục kho cũng có (nhân vật / bối cảnh / đồ vật), kèm `asset`.
  nodeType?: string;
  // Mục Mẫu: mã mẫu workflow.
  template?: string;
  asset?: AssetSummary;
  // "have": đã làm được. (Bản phác còn mục "mới" chưa làm; ô tìm chỉ liệt kê cái đã có.)
  tag: "have";
};

export type PortFilter = { kind: PortKind; dir: "out" | "in" };

export const RECENT_MAX = 6;

export function catalogItems(assets: readonly AssetSummary[] = []): CatalogItem[] {
  const nodes: CatalogItem[] = Object.entries(webNodes)
    .filter(([, impl]) => !impl.definition.hidden)
    .map(([type, impl]) => ({
      key: `node-${type}`,
      category: NODE_CATEGORY[type] ?? "co-ban",
      icon: iconOf(type),
      label: impl.definition.label,
      description: impl.definition.description,
      nodeType: type,
      tag: "have",
    }));
  const fromLibrary: CatalogItem[] = assets.map((a) => ({
    key: `asset-${a.id}`,
    category: "nguon-kho",
    icon: iconOf(a.kind),
    label: a.name,
    description: `Từ kho · ${webNodes[a.kind]?.definition.label ?? a.kind} · dùng lại, không tốn lượt`,
    nodeType: a.kind,
    asset: a,
    tag: "have",
  }));
  const templates: CatalogItem[] = WORKFLOW_TEMPLATES.map((t) => ({
    key: `template-${t.id}`,
    category: "mau",
    icon: "▦",
    label: t.name,
    description: t.label,
    template: t.id,
    tag: "have",
  }));
  return [...nodes, ...fromLibrary, ...templates];
}

// Cổng đầu tiên của node khớp bộ lọc: kéo từ cổng RA thì cần cổng VÀO cùng loại, kéo từ cổng VÀO thì cần cổng RA cùng loại.
export function portFor(item: CatalogItem, filter: PortFilter): PortDef | undefined {
  const def = webNodes[item.nodeType ?? ""]?.definition;
  if (!def) return undefined;
  return (filter.dir === "out" ? def.inputs : def.outputs).find((p) => p.kind === filter.kind);
}

// Mẫu workflow không có cổng nên bị loại khi đang lọc.
export const filterByPort = (items: readonly CatalogItem[], filter: PortFilter): CatalogItem[] => items.filter((i) => portFor(i, filter) !== undefined);

// Bỏ dấu tiếng Việt và chữ hoa để gõ "canh" vẫn ra "Cảnh".
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");
const D_STROKE = new RegExp(String.fromCharCode(0x111), "gi");
const fold = (s: string): string => s.normalize("NFD").replace(COMBINING_MARKS, "").replace(D_STROKE, "d").toLowerCase();

// Khớp tên trước (đầu tên hơn giữa tên), rồi mới tới mô tả; cùng hạng giữ thứ tự danh mục.
export function searchItems(items: readonly CatalogItem[], query: string): CatalogItem[] {
  const q = fold(query.trim());
  if (!q) return [...items];
  const rank = (i: CatalogItem): number => {
    const label = fold(i.label);
    if (label.startsWith(q)) return 0;
    if (label.includes(q)) return 1;
    return fold(i.description).includes(q) ? 2 : -1;
  };
  return items
    .map((item, order) => ({ item, order, r: rank(item) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.order - b.order)
    .map((x) => x.item);
}

// Nhóm hiện trên thanh bên: "Gần đây" chỉ khi đã có mục gần đây; nhóm khác chỉ khi có mục. `forced`: nhóm luôn hiện (Nguồn & kho khi kho tải lỗi, để còn chỗ báo).
export const visibleCategories = (items: readonly CatalogItem[], recentCount: number, forced: readonly CategoryId[] = []): (typeof CATEGORIES)[number][] =>
  CATEGORIES.filter((c) => forced.includes(c.id) || (c.id === "gan-day" ? recentCount > 0 : items.some((i) => i.category === c.id)));

// Danh sách "gần đây" đọc từ localStorage: chỉ giữ chuỗi, tối đa RECENT_MAX; giá trị hỏng thì rỗng.
export const recentFrom = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, RECENT_MAX) : []);

export const rememberRecent = (list: readonly string[], key: string): string[] => [key, ...list.filter((k) => k !== key)].slice(0, RECENT_MAX);

export function recentItems(items: readonly CatalogItem[], keys: readonly string[]): CatalogItem[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  return keys.flatMap((k) => {
    const item = byKey.get(k);
    return item ? [item] : [];
  });
}
