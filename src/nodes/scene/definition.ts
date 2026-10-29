import { z } from "zod";
import { CAMERA_ANGLES, CAMERA_MOVES, parsePropLines, SHOT_SIZES, SUBJECTS, type Shot } from "../../shared/director";
import { defineNode } from "../../shared/node-definition";
import { PROVIDER_IDS, type ProviderId } from "../../shared/providers";
import { SHOT_CACHE_VERSION } from "../film/definition";

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

// Một cảnh của Dựng phim, thành node riêng. Cắt hay nối không còn là tham số: có dây "Nối tiếp" là cảnh nối.
export type SceneParams = Omit<Shot, "id" | "link"> & { provider: ProviderId; take?: number };

export const params = z.object({
  size: z.enum(keys(SHOT_SIZES)),
  angle: z.enum(keys(CAMERA_ANGLES)),
  move: z.enum(keys(CAMERA_MOVES)),
  subject: z.enum(keys(SUBJECTS)),
  start: z.string(),
  motion: z.string(),
  props: z.string(),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
  // Lần tạo: không có mặc định, để thiếu vẫn là thiếu (khoá cache cũ giữ nguyên).
  take: z.number().int().min(1).optional(),
}) satisfies z.ZodType<SceneParams>;

export const definition = defineNode<SceneParams>({
  type: "scene",
  label: "Cảnh",
  description: "Một cảnh 5 giây: ảnh khung (hoặc khung cuối cảnh trước) → clip, đo độ sáng để Ghép phim bù.",
  inputs: [
    { name: "character", kind: "imageset", label: "Nhân vật" },
    { name: "location", kind: "imageset", label: "Không gian" },
    { name: "props", kind: "props", label: "Đồ vật", optional: true },
    { name: "follow", kind: "video", label: "Nối tiếp", optional: true },
  ],
  outputs: [
    { name: "clip", kind: "video", label: "Clip" },
    { name: "frame", kind: "image", label: "Khung đầu" },
    { name: "last", kind: "image", label: "Khung cuối" },
  ],
  // Cùng vùng bước con và cùng phiên bản prompt với Dựng phim: cảnh giống hệt dùng lại kết quả của nhau.
  stepScope: "film",
  cacheVersion: SHOT_CACHE_VERSION,
  params,
  defaults: { size: "MS", angle: "eye", move: "static", subject: "character", start: "", motion: "", props: "", provider: "fake" },
  estimate(p, connected) {
    const textOnly = p.subject === "none" && parsePropLines(p.props).items.length === 0;
    return connected.has("follow") || textOnly ? { image: 0, video: 1, text: 0 } : { image: 1, video: 1, text: 0 };
  },
});
