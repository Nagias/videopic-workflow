import { z } from "zod";
import { shorten } from "../../shared/card-line";
import { defineNode } from "../../shared/node-definition";
import { PROVIDER_IDS } from "../../shared/providers";
import { styleMismatch } from "../../shared/style-check";

export const OUTLINE_MAX_TRIES = 3;
export const MAX_EPISODE_SHOTS = 36;

// Bước 2 của luồng duyệt (thiết kế 2026-11-06 mục 3.3): dàn ý 3 phần (gây chuyện, leo thang, chốt) với các đợt theo số cảnh.
// Node này giữ độ dài tập (số cảnh); Biên kịch nối dàn ý thì viết đúng số cảnh đó. Gõ đè dàn ý thì không gọi dịch vụ.
export const params = z.object({
  shotCount: z.number().int().min(12, "Ít nhất 12 cảnh (1 phút)").max(MAX_EPISODE_SHOTS, `Nhiều nhất ${MAX_EPISODE_SHOTS} cảnh (3 phút)`),
  own: z.string(),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
});
export type OutlineParams = z.infer<typeof params>;

export const definition = defineNode<OutlineParams>({
  type: "outline",
  label: "Dàn ý tập phim",
  description:
    "Đạo diễn AI chia tập phim thành 3 phần (gây chuyện, leo thang nhiều đợt, chốt), ghi cuối mỗi đợt ai ở đâu, đồ vật ở đâu. Duyệt, sửa, rồi mới cho Biên kịch viết cảnh.",
  inputs: [
    { name: "idea", kind: "text", label: "Ý tưởng" },
    { name: "character", kind: "imageset", label: "Dàn nhân vật" },
    { name: "location", kind: "imageset", label: "Không gian", optional: true },
  ],
  outputs: [{ name: "outline", kind: "outline", label: "Dàn ý" }],
  params,
  defaults: { shotCount: MAX_EPISODE_SHOTS, own: "", provider: "fake" },
  preflight: styleMismatch,
  cardLine: (p, out) => {
    const o = out?.outline;
    const len = `${p.shotCount ?? MAX_EPISODE_SHOTS} cảnh`;
    if (o?.kind === "outline") return `${shorten(o.title, 40)} · ${len}`;
    return typeof p.own === "string" && p.own.trim() ? `Dàn ý tự viết · ${len}` : len;
  },
  estimate: (p) => ({ image: 0, video: 0, text: p.own.trim() ? 0 : OUTLINE_MAX_TRIES }),
});
