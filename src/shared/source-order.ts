// Thứ tự dây vào của một cổng nhiều dây (cổng Clip của Ghép phim). Dùng chung cho máy chủ (src/core/executor.ts: orderSources)
// và giao diện (dải thứ tự clip của Ghép phim), để hai bên không bao giờ lệch nhau.

type Position = { x: number; y: number };

const idsOf = (order: unknown): string[] => (Array.isArray(order) ? order.filter((x): x is string => typeof x === "string") : []);

// Theo `order` (mã node nguồn) trước, phần còn lại theo toạ độ x rồi y của node nguồn (trái sang phải, trên xuống dưới).
// Mã trong `order` mà không có dây thì bỏ qua. Không đổi mảng đầu vào.
export function orderSourceList<T extends { source: string }>(sources: readonly T[], order: unknown, positionOf: (nodeId: string) => Position | undefined): T[] {
  const ranked = idsOf(order);
  const rank = (s: T) => {
    const i = ranked.indexOf(s.source);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return [...sources].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (ra !== Number.POSITIVE_INFINITY) return 0;
    const pa = positionOf(a.source);
    const pb = positionOf(b.source);
    return (pa?.x ?? 0) - (pb?.x ?? 0) || (pa?.y ?? 0) - (pb?.y ?? 0);
  });
}

// `order` mới sau khi kéo clip `moved` tới vị trí `to` (chỉ số trong danh sách sau khi đã bỏ clip đang kéo ra, kẹp vào hai đầu).
// `shown`: mã các clip đang nối, đúng thứ tự đang hiện. Mã đã lưu trong `stored` mà không còn nối vào được giữ lại ở cuối
// (nối lại clip đó thì chỗ cũ vẫn còn), không chen vào thứ tự các clip đang nối.
export function orderAfterMove(stored: unknown, shown: readonly string[], moved: string, to: number): string[] {
  const from = shown.indexOf(moved);
  const next = [...shown];
  if (from >= 0) {
    next.splice(from, 1);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  }
  return [...next, ...idsOf(stored).filter((id) => !shown.includes(id))];
}

// Chỉ số đích khi bấm Alt+mũi tên: dịch `by` bước (-1 lên, +1 xuống), đứng yên ở hai đầu.
export function shiftTarget(index: number, by: -1 | 1, count: number): number {
  return Math.max(0, Math.min(index + by, count - 1));
}
