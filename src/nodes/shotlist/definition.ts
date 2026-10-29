import { z } from "zod";
import { checkShotList, ShotSchema } from "../../shared/director";
import { defineNode } from "../../shared/node-definition";
import type { ShotListValue } from "../../shared/ports";

export const params = z
  .object({ shots: z.array(ShotSchema) })
  .superRefine((v, ctx) => {
    for (const e of checkShotList(v.shots).errors) ctx.addIssue({ code: "custom", message: e });
  });
export type ShotListParams = z.infer<typeof params>;

export const shotListValue = (p: ShotListParams): ShotListValue => ({ kind: "shotlist", shots: p.shots });

export const definition = defineNode<ShotListParams>({
  type: "shotlist",
  label: "Danh sách cảnh",
  description: "Các cảnh theo thứ tự: cỡ cảnh, góc máy, chuyển động, hành động, cắt hay nối với cảnh trước.",
  inputs: [],
  outputs: [{ name: "shots", kind: "shotlist", label: "Cảnh" }],
  // Thay bằng nhóm node Cảnh; workflow cũ tự chuyển khi mở (src/features/workflows/upgrade.ts).
  hidden: true,
  params,
  defaults: { shots: [] },
  // Chỉ chép tham số ra cổng: không gọi dịch vụ; kết quả biết trước (Dựng phim phía sau ước theo đúng danh sách cảnh).
  estimate: () => ({ image: 0, video: 0, text: 0 }),
  predict: (p) => ({ shots: shotListValue(p) }),
});
