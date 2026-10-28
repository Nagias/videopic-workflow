import { z } from "zod";
import { defineNode } from "../../shared/node-definition";
import { PROVIDER_IDS } from "../../shared/providers";

export const SHOT_SECONDS = 5;
export const CHAIN_TRIM_SEC = 2 / 24;
export const LAST_FRAME_FROM_END_SEC = 0.2;
export const SERVICE_FAILURE_LIMIT = 3;

export const params = z.object({
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
  fixBrightness: z.boolean(),
});
export type FilmParams = z.infer<typeof params>;

export const definition = defineNode<FilmParams>({
  type: "film",
  label: "Dựng phim",
  description: "Chạy thẳng: ảnh khung từng cảnh → clip → bù sáng → ghép thành một video.",
  inputs: [
    { name: "character", kind: "imageset", label: "Nhân vật" },
    { name: "location", kind: "imageset", label: "Không gian" },
    { name: "shots", kind: "shotlist", label: "Danh sách cảnh" },
  ],
  outputs: [
    { name: "video", kind: "video", label: "Phim" },
    { name: "storyboard", kind: "storyboard", label: "Storyboard" },
  ],
  params,
  defaults: { provider: "fake", fixBrightness: true },
});
