import { z } from "zod";
import { defineNode } from "../../shared/node-definition";
import { PROVIDER_IDS } from "../../shared/providers";

export const params = z.object({
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ tạo video" }),
  durationSec: z.union([z.literal(5), z.literal(10)], { error: "Muse chỉ tạo clip 5 hoặc 10 giây" }),
});
export type GenerateVideoParams = z.infer<typeof params>;

export const definition = defineNode<GenerateVideoParams>({
  type: "generate-video",
  label: "Tạo video",
  description: "Tạo một clip từ prompt bằng dịch vụ đã chọn.",
  inputs: [{ name: "prompt", kind: "text", label: "Prompt" }],
  outputs: [{ name: "video", kind: "video", label: "Video" }],
  params,
  defaults: { provider: "fake", durationSec: 5 },
  estimate: () => ({ image: 0, video: 1, text: 0 }),
});
