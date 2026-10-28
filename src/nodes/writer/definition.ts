import { z } from "zod";
import { defineNode } from "../../shared/node-definition";
import { codeVersion, repairPrompt, writerPrompt } from "../../shared/prompts";
import { PROVIDER_IDS } from "../../shared/providers";

export const WRITER_MAX_TRIES = 3;

export const params = z.object({
  idea: z.string().trim().min(20, "Ý tưởng quá ngắn (cần ai, ở đâu, làm gì)"),
  shotCount: z.number().int().min(4, "Ít nhất 4 cảnh").max(24, "Nhiều nhất 24 cảnh (2 phút)"),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
});
export type WriterParams = z.infer<typeof params>;

export const definition = defineNode<WriterParams>({
  type: "writer",
  label: "Biên kịch (AI)",
  description: "Nhờ chính chat Muse viết danh sách cảnh (khung đầu, chuyển động, đồ vật) và danh sách đồ vật từ một ý tưởng; tự kiểm luật đạo diễn, sai thì nhờ sửa.",
  inputs: [
    { name: "character", kind: "imageset", label: "Nhân vật", optional: true },
    { name: "location", kind: "imageset", label: "Không gian", optional: true },
  ],
  outputs: [
    { name: "shots", kind: "shotlist", label: "Cảnh" },
    { name: "props", kind: "propspec", label: "Danh sách đồ vật" },
  ],
  cacheVersion: codeVersion(writerPrompt, repairPrompt),
  params,
  defaults: { idea: "", shotCount: 12, provider: "fake" },
});
