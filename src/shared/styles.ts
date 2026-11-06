import { z } from "zod";

// Phong cách phim: chọn một lần (node Dàn nhân vật, Không gian, Đồ vật) và đi theo dữ liệu (trường `style` của bộ ảnh,
// danh sách đồ vật). Vắng `style` = "thuc": đúng đường prompt người thật như trước, không đổi chữ nào.
// Câu chữ của các kiểu hoạt hình nằm ở src/shared/cartoon-prompts.ts (để nằm trong CARTOON_VERSION).

export const FILM_STYLE_IDS = ["thuc", "hoat-hinh-3d", "hoat-hinh-2d"] as const;
export type FilmStyle = (typeof FILM_STYLE_IDS)[number];

export const CARTOON_STYLE_IDS = ["hoat-hinh-2d", "hoat-hinh-3d"] as const;
export type CartoonStyle = (typeof CARTOON_STYLE_IDS)[number];

export const FILM_STYLE_LABEL: Record<FilmStyle, string> = {
  thuc: "Người thật (vlog)",
  "hoat-hinh-3d": "Hoạt hình 3D",
  "hoat-hinh-2d": "Hoạt hình 2D",
};

export const FilmStyleSchema = z.enum(FILM_STYLE_IDS, { error: "Phong cách phim không hợp lệ" });
export const CartoonStyleSchema = z.enum(CARTOON_STYLE_IDS, { error: "Phong cách hoạt hình không hợp lệ" });

export const isCartoon = (style: string | undefined): style is CartoonStyle => style === "hoat-hinh-2d" || style === "hoat-hinh-3d";

export const styleOf = (style: string | undefined): FilmStyle => (isCartoon(style) ? style : "thuc");
