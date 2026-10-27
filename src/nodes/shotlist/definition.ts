import { z } from "zod";
import { checkShotList, ShotSchema } from "../../shared/director";
import { defineNode } from "../../shared/node-definition";

export const params = z
  .object({ shots: z.array(ShotSchema) })
  .superRefine((v, ctx) => {
    for (const e of checkShotList(v.shots).errors) ctx.addIssue({ code: "custom", message: e });
  });
export type ShotListParams = z.infer<typeof params>;

export const definition = defineNode<ShotListParams>({
  type: "shotlist",
  label: "Danh sách cảnh",
  description: "Các cảnh theo thứ tự: cỡ cảnh, góc máy, chuyển động, hành động, cắt hay nối với cảnh trước.",
  inputs: [],
  outputs: [{ name: "shots", kind: "shotlist", label: "Cảnh" }],
  params,
  defaults: { shots: [] },
});
