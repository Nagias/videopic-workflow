import { z } from "zod";
import { defineNode } from "../../shared/node-definition";
import { shorten } from "../../shared/card-line";
import { codeVersion, DEFAULT_LOOK, LOCATION_SHEET } from "../../shared/prompts";
import type { ImageSetValue } from "../../shared/ports";
import { PROVIDER_IDS } from "../../shared/providers";

export const params = z.object({
  name: z.string().optional(),
  description: z.string().trim().min(20, "Mô tả bối cảnh quá ngắn (cần địa hình, cây cối, ánh sáng)"),
  look: z.string().optional(),
  // Ảnh thật bối cảnh (tối đa 2: toàn cảnh, cận khu chính). Có ảnh thì không gọi dịch vụ (spec 2026-11-03 mục 3.3).
  photos: z.array(z.string().min(1)).max(2, "Tối đa 2 ảnh bối cảnh").optional(),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
});
export type LocationParams = z.infer<typeof params>;

export const lookOf = (p: Pick<LocationParams, "look">) => p.look?.trim() || DEFAULT_LOOK;

const PHOTO_VIEWS = ["wide", "close"] as const;

// Bộ ảnh bối cảnh từ ảnh thật; không có ảnh thì undefined (vẽ bằng dịch vụ như cũ).
export function photoSet(p: LocationParams): ImageSetValue | undefined {
  const photos = p.photos ?? [];
  if (photos.length === 0) return undefined;
  return { kind: "imageset", role: "location", description: p.description, images: photos.map((mediaId, i) => ({ mediaId, view: PHOTO_VIEWS[i]! })), look: lookOf(p) };
}

export const definition = defineNode<LocationParams>({
  type: "location",
  label: "Hồ sơ không gian",
  description: "Tạo bộ ảnh mẫu của bối cảnh không có người, kèm câu tông ảnh dùng chung cho mọi cảnh.",
  inputs: [],
  outputs: [{ name: "location", kind: "imageset", label: "Không gian" }],
  library: "location",
  cacheVersion: codeVersion(LOCATION_SHEET),
  params,
  defaults: { name: "", description: "", look: DEFAULT_LOOK, provider: "fake" },
  cardLine: (p, out) => {
    const set = out?.location;
    const where = shorten(p.name, 24) || shorten(p.description, 24) || "chưa mô tả";
    return set?.kind === "imageset" ? `${where} · ${set.images.length} ảnh` : where;
  },
  // 1 ảnh mỗi góc của bộ ảnh bối cảnh (2); có ảnh thật thì 0.
  estimate: (p) => ({ image: photoSet(p) ? 0 : LOCATION_SHEET(p.description, lookOf(p)).length, video: 0, text: 0 }),
  // Có ảnh thật thì biết trước kết quả (thẻ Cảnh phía sau ước tính được ngay).
  predict: (p) => {
    const set = photoSet(p);
    return set ? { location: set } : undefined;
  },
});
