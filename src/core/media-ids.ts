// Lấy mọi mã media nằm trong một giá trị (đầu ra node, kết quả bước con) để kiểm file còn hay để làm ảnh đại diện.
const MEDIA_KEYS = new Set(["mediaId", "keyframeId", "clipId"]);

export function collectMediaIds(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) collectMediaIds(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (MEDIA_KEYS.has(k) && typeof v === "string") out.push(v);
      else collectMediaIds(v, out);
    }
  }
  return out;
}
