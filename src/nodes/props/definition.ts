import { z } from "zod";
import { defineNode } from "../../shared/node-definition";
import { propSpecProblems, PropSpecItemSchema, type PropSpecItem } from "../../shared/ports";
import { codeVersion, propStatePrompt, propStillPrompt } from "../../shared/prompts";
import { PROVIDER_IDS } from "../../shared/providers";

// Một dòng gõ tay trong node: trạng thái viết cách nhau bằng dấu phẩy, trạng thái đầu là trạng thái gốc.
export const PropRowSchema = z.object({ name: z.string(), description: z.string(), states: z.string() });
export type PropRow = z.infer<typeof PropRowSchema>;

export const params = z.object({
  name: z.string().optional(),
  items: z.array(PropRowSchema),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
});
export type PropsParams = z.infer<typeof params>;

export function rowsToSpec(rows: PropRow[]): PropSpecItem[] {
  return rows.map((r) => ({ name: r.name.trim(), description: r.description.trim(), states: r.states.split(",").map((s) => s.trim()).filter(Boolean) }));
}

// allowEmpty: danh sách đến từ Biên kịch — kịch bản không cần đồ vật nào là hợp lệ.
export function checkSpec(items: PropSpecItem[], opts: { allowEmpty: boolean }): PropSpecItem[] {
  if (items.length === 0 && !opts.allowEmpty) throw new Error("Chưa có đồ vật nào (gõ trong node Đồ vật hoặc nối từ Biên kịch)");
  const parsed = items.map((item) => {
    const r = PropSpecItemSchema.safeParse(item);
    if (!r.success) throw new Error(`Đồ vật "${item.name || "?"}": ${r.error.issues.map((i) => i.message).join("; ")}`);
    return r.data;
  });
  const problems = propSpecProblems(parsed);
  if (problems.length) throw new Error(problems.join("; "));
  return parsed;
}

export const definition = defineNode<PropsParams>({
  type: "props",
  label: "Đồ vật",
  description: "Ảnh mẫu từng đồ vật (rìu, khúc gỗ, lều…) và các trạng thái của nó (nguyên → bổ đôi), để mọi cảnh giữ đúng hình dạng.",
  inputs: [{ name: "spec", kind: "propspec", label: "Từ Biên kịch", optional: true }],
  outputs: [{ name: "props", kind: "props", label: "Đồ vật" }],
  library: "props",
  cacheVersion: codeVersion(propStillPrompt, propStatePrompt),
  params,
  defaults: { name: "", items: [], provider: "fake" },
});
