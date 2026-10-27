import { z } from "zod";
import { defineNode } from "../../shared/node-definition";
import { PROVIDER_IDS } from "../../shared/providers";

export const params = z.object({
  description: z.string().trim().min(20, "Mô tả nhân vật quá ngắn (cần gương mặt, tóc, vóc dáng, trang phục)"),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
});
export type CharacterParams = z.infer<typeof params>;

export const CHARACTER_VIEWS = (d: string) => [
  {
    view: "front",
    label: "chân dung chính diện",
    prompt: `Photorealistic close-up portrait photo, front view, of ${d}. Plain natural outdoor background, soft daylight, realistic skin texture with pores, documentary photography`,
  },
  {
    view: "three-quarter",
    label: "chân dung nghiêng 3/4",
    prompt: `Photorealistic portrait photo of the same woman as in the attached photo, three-quarter view turned slightly to the left, same face, same hair, same outfit: ${d}. Outdoor forest background, natural light`,
  },
  {
    view: "full-body",
    label: "toàn thân",
    prompt: `Photorealistic full-body photo of the same woman as in the attached photo, standing, head to toe visible, same face, hair and outfit: ${d}. Forest clearing background, natural light`,
  },
];

export const definition = defineNode<CharacterParams>({
  type: "character",
  label: "Hồ sơ nhân vật",
  description: "Tạo bộ ảnh gốc của nhân vật (chính diện, 3/4, toàn thân) để mọi cảnh giữ đúng mặt và trang phục.",
  inputs: [],
  outputs: [{ name: "character", kind: "imageset", label: "Nhân vật" }],
  params,
  defaults: { description: "", provider: "fake" },
});
