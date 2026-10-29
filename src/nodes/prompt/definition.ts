import { z } from "zod";
import { defineNode } from "../../shared/node-definition";

export const params = z.object({
  text: z.string().trim().min(1, "Prompt đang trống — hãy viết mô tả cảnh"),
});
export type PromptParams = z.infer<typeof params>;

export const definition = defineNode<PromptParams>({
  type: "prompt",
  label: "Prompt",
  description: "Viết mô tả cảnh. Nối ra node Tạo video.",
  inputs: [],
  outputs: [{ name: "text", kind: "text", label: "Prompt" }],
  params,
  defaults: { text: "" },
  estimate: () => ({ image: 0, video: 0, text: 0 }),
});
