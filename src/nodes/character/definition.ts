import { z } from "zod";
import { defineNode } from "../../shared/node-definition";
import { CHARACTER_SHEET, codeVersion, DEFAULT_LOOK } from "../../shared/prompts";
import { PROVIDER_IDS } from "../../shared/providers";

export const params = z.object({
  name: z.string().optional(),
  description: z.string().trim().min(20, "Mô tả nhân vật quá ngắn (cần gương mặt, tóc, vóc dáng, trang phục)"),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
});
export type CharacterParams = z.infer<typeof params>;

export const definition = defineNode<CharacterParams>({
  type: "character",
  label: "Hồ sơ nhân vật",
  description: "Tạo bộ ảnh mẫu của nhân vật (mặt cận, toàn thân chính diện, nghiêng, sau lưng) để mọi cảnh giữ đúng mặt và trang phục.",
  inputs: [],
  outputs: [{ name: "character", kind: "imageset", label: "Nhân vật" }],
  library: "character",
  cacheVersion: codeVersion(CHARACTER_SHEET),
  params,
  defaults: { name: "", description: "", provider: "fake" },
  // 1 ảnh mỗi góc của bộ ảnh mẫu (mặt cận, toàn thân chính diện, nghiêng, sau lưng: 4).
  estimate: (p) => ({ image: CHARACTER_SHEET(p.description, DEFAULT_LOOK).length, video: 0, text: 0 }),
});
