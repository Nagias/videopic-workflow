import { z } from "zod";
import { defineNode } from "../../shared/node-definition";
import { codeVersion, DEFAULT_LOOK, LOCATION_SHEET } from "../../shared/prompts";
import { PROVIDER_IDS } from "../../shared/providers";

export const params = z.object({
  name: z.string().optional(),
  description: z.string().trim().min(20, "Mô tả bối cảnh quá ngắn (cần địa hình, cây cối, ánh sáng)"),
  look: z.string().optional(),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
});
export type LocationParams = z.infer<typeof params>;

export const lookOf = (p: Pick<LocationParams, "look">) => p.look?.trim() || DEFAULT_LOOK;

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
  // 1 ảnh mỗi góc của bộ ảnh bối cảnh (2).
  estimate: (p) => ({ image: LOCATION_SHEET(p.description, lookOf(p)).length, video: 0, text: 0 }),
});
