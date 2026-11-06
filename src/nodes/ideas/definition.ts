import { z } from "zod";
import { shorten } from "../../shared/card-line";
import { defineNode } from "../../shared/node-definition";
import { PROVIDER_IDS } from "../../shared/providers";
import { styleMismatch } from "../../shared/style-check";

export const IDEAS_MAX_TRIES = 3;

// Bước 1 của luồng duyệt (thiết kế 2026-11-06 mục 3.3): Muse đề xuất 3 ý tưởng tập theo dàn nhân vật, luật loạt phim, bối cảnh;
// người dùng chọn một, hoặc gõ ý tưởng riêng (khi đó không gọi dịch vụ). Đổi lựa chọn thì chạy lại không tốn lượt (bước con có cache).
export const params = z.object({
  hint: z.string(),
  pick: z.number().int().min(1, "Chọn ý tưởng 1 đến 3").max(3, "Chọn ý tưởng 1 đến 3"),
  own: z.string(),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
});
export type IdeasParams = z.infer<typeof params>;

export const definition = defineNode<IdeasParams>({
  type: "ideas",
  label: "Ý tưởng tập phim",
  description: "Đạo diễn AI đề xuất 3 ý tưởng tập phim hoạt hình (mục tiêu tranh giành, các đợt leo thang, cú chốt). Chọn một, hoặc gõ ý tưởng riêng.",
  inputs: [
    { name: "character", kind: "imageset", label: "Dàn nhân vật" },
    { name: "location", kind: "imageset", label: "Không gian", optional: true },
  ],
  outputs: [
    { name: "idea", kind: "text", label: "Ý tưởng đã chọn" },
    { name: "options", kind: "text", label: "3 ý tưởng" },
  ],
  params,
  defaults: { hint: "", pick: 1, own: "", provider: "fake" },
  preflight: styleMismatch,
  cardLine: (p, out) => {
    const idea = out?.idea;
    if (idea?.kind === "text") return shorten(idea.text, 60);
    return typeof p.own === "string" && p.own.trim() ? `Ý tưởng riêng: ${shorten(p.own, 40)}` : `Chọn ý tưởng ${p.pick ?? 1}`;
  },
  // Ý tưởng riêng: 0. Không thì 1 lượt chữ, sai luật nhờ sửa tối đa IDEAS_MAX_TRIES lượt (ước dư).
  estimate: (p) => ({ image: 0, video: 0, text: p.own.trim() ? 0 : IDEAS_MAX_TRIES }),
});
