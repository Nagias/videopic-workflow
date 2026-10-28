import { PROVIDER_IDS, type ProviderId } from "../../../shared/providers";

type XY = { x: number; y: number };
type Placed = { position: XY; data: { params: Record<string, unknown> } };

const NODE_HALF_WIDTH = 160;
const NODE_TOP_OFFSET = 120;
const STEP = 40;
const NEAR = 20;

// Node mới đặt giữa vùng đang nhìn; trùng chỗ node khác thì lùi chéo xuống cho khỏi đè lên nhau.
export function placeNewNode(viewCenter: XY, nodes: Placed[]): XY {
  let p = { x: Math.round(viewCenter.x - NODE_HALF_WIDTH), y: Math.round(viewCenter.y - NODE_TOP_OFFSET) };
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
