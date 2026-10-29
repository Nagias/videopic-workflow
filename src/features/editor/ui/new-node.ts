import { PROVIDER_IDS, type ProviderId } from "../../../shared/providers";

type XY = { x: number; y: number };
type Placed = { position: XY; data: { params: Record<string, unknown> } };

// Bề rộng thẻ theo bản phác: thẻ thường 250, thẻ Cảnh 210 (vừa lưới nhóm Phân cảnh 230 × 250), Ghép phim 340.
// Một nơi duy nhất: GraphNode đặt bề rộng thẻ từ đây và chỗ đặt node mới tính tâm theo đây.
export const DEFAULT_CARD_WIDTH = 250;
const CARD_WIDTH: Record<string, number> = { scene: 210, "film-combine": 340 };
export const cardWidthOf = (type: string | undefined): number => CARD_WIDTH[type ?? ""] ?? DEFAULT_CARD_WIDTH;

const NODE_TOP_OFFSET = 120;
const STEP = 40;
const NEAR = 20;

// Node mới (loại `type`) đặt giữa vùng đang nhìn, tâm thẻ đúng tâm vùng; trùng chỗ node khác thì lùi chéo xuống cho khỏi đè lên nhau.
export function placeNewNode(viewCenter: XY, nodes: Placed[], type?: string): XY {
  let p = { x: Math.round(viewCenter.x - cardWidthOf(type) / 2), y: Math.round(viewCenter.y - NODE_TOP_OFFSET) };
  while (nodes.some((n) => Math.abs(n.position.x - p.x) < NEAR && Math.abs(n.position.y - p.y) < NEAR)) {
    p = { x: p.x + STEP, y: p.y + STEP };
  }
  return p;
}

const isProvider = (v: unknown): v is ProviderId => typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);

// Node mới dùng cùng dịch vụ với các node đang có trong workflow (không thì giữ mặc định của node).
export function inheritProvider(defaults: Record<string, unknown>, nodes: Placed[]): Record<string, unknown> {
  if (!("provider" in defaults)) return { ...defaults };
  const used = nodes.map((n) => n.data.params.provider).find(isProvider);
  return used ? { ...defaults, provider: used } : { ...defaults };
}
