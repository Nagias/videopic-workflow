import { z } from "zod";
import { defineNode } from "../../shared/node-definition";
import { PropSpecItemSchema, type PropSpecItem } from "../../shared/ports";
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

export function checkSpec(items: PropSpecItem[]): PropSpecItem[] {
  if (items.length === 0) throw new Error("Chưa có đồ vật nào (gõ trong node Đồ vật hoặc nối từ Biên kịch)");
  const seen = new Set<string>();
  return items.map((item) => {
    const parsed = PropSpecItemSchema.safeParse(item);
    if (!parsed.success) throw new Error(`Đồ vật "${item.name || "?"}": ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    const key = parsed.data.name.toLowerCase();
    if (seen.has(key)) throw new Error(`Đồ vật trùng tên "${parsed.data.name}"`);
    seen.add(key);
    return parsed.data;
  });
}

export const definition = defineNode<PropsParams>({
  type: "props",
  label: "Đồ vật",
  description: "Ảnh mẫu từng đồ vật (rìu, khúc gỗ, lều…) và các trạng thái của nó (nguyên → bổ đôi), để mọi cảnh giữ đúng hình dạng.",
  inputs: [{ name: "spec", kind: "propspec", label: "Từ Biên kịch", optional: true }],
  outputs: [{ name: "props", kind: "props", label: "Đồ vật" }],
  params,
  defaults: { name: "", items: [], provider: "fake" },
});
