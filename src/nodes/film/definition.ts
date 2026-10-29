import { z } from "zod";
import { defineNode } from "../../shared/node-definition";
import { pickInput } from "../../shared/ports";
import { codeVersion, keyframePrompt, motionPrompt, textVideoPrompt } from "../../shared/prompts";
import { PROVIDER_IDS } from "../../shared/providers";
import { shotListCalls } from "../../shared/shot-plan";

export { SHOT_SECONDS } from "../../shared/director";
export const CHAIN_TRIM_SEC = 2 / 24;
export const LAST_FRAME_FROM_END_SEC = 0.2;
// Phiên bản các prompt tạo cảnh: Dựng phim và Cảnh dùng chung (cùng bước con trong shot-steps.ts).
export const SHOT_CACHE_VERSION = codeVersion(keyframePrompt, motionPrompt, textVideoPrompt);

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
    { name: "props", kind: "props", label: "Đồ vật", optional: true },
  ],
  outputs: [
    { name: "video", kind: "video", label: "Phim" },
    { name: "storyboard", kind: "storyboard", label: "Storyboard" },
  ],
  cacheVersion: SHOT_CACHE_VERSION,
  // Thay bằng Cảnh + Ghép phim; workflow cũ tự chuyển khi mở (src/features/workflows/upgrade.ts), bản cũ vẫn chạy được.
  hidden: true,
  params,
  defaults: { provider: "fake", fixBrightness: true },
  // Tổng các cảnh theo đúng khoá bước con của makeShot() (cảnh nối: clip cảnh trước có sẵn thì biết, không thì 1 video).
  // Chưa biết danh sách cảnh (node Danh sách cảnh/Biên kịch sẽ chạy) thì không ước được.
  estimate(p, _connected, known) {
    const inputs = known?.inputs ?? {};
    const shots = pickInput(inputs, "shots", "shotlist")?.shots;
    if (!shots) return undefined;
    const refs = { character: pickInput(inputs, "character", "imageset"), location: pickInput(inputs, "location", "imageset"), props: pickInput(inputs, "props", "props") };
    return shotListCalls(shots, { providerId: p.provider, ...refs }, (k) => known?.step(k));
  },
});
