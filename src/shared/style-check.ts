import type { PreflightCtx } from "./node-definition";
import { FILM_STYLE_LABEL, styleOf, type FilmStyle } from "./styles";

// Khoá cứng (thiết kế 2026-11-06 mục 3.1): nhân vật và bối cảnh cắm vào cùng một node phải cùng phong cách phim,
// báo trước khi chạy (chưa tốn lượt). Phong cách đọc từ tham số node nguồn: Dàn nhân vật, Không gian; Hồ sơ nhân vật là người thật.
function sourceStyle(ctx: PreflightCtx, port: string): FilmStyle | undefined {
  const src = ctx.sources(ctx.node.node.id, port)[0];
  const planned = src ? ctx.planned.get(src.source) : undefined;
  if (!planned) return undefined;
  const params = (planned.params ?? {}) as { style?: string };
  switch (planned.node.type) {
    case "cast":
    case "location":
      return styleOf(params.style);
    case "character":
      return "thuc";
    default:
      return undefined;
  }
}

export function styleMismatch(ctx: PreflightCtx): string[] {
  const character = sourceStyle(ctx, "character");
  const location = sourceStyle(ctx, "location");
  if (!character || !location || character === location) return [];
  return [`Nhân vật là "${FILM_STYLE_LABEL[character]}" nhưng Không gian là "${FILM_STYLE_LABEL[location]}" — chọn cùng một phong cách phim ở node Không gian`];
}
