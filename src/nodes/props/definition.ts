import { z } from "zod";
import { defineNode, type EstimateKnown } from "../../shared/node-definition";
import { mediaIdOf, pickInput, propSpecProblems, PropSpecItemSchema, type PropItem, type PropSpecItem, type PropSpecValue } from "../../shared/ports";
import { codeVersion, DEFAULT_LOOK, propStatePrompt, propStillPrompt } from "../../shared/prompts";
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

// Danh sách món node sẽ làm: từ Biên kịch (cổng spec) nếu có, không thì từ các dòng gõ tay. Kiểm bằng checkSpec() trước khi chạy.
export const specOf = (p: PropsParams, fromWriter: PropSpecValue | undefined): PropSpecItem[] => (fromWriter ? fromWriter.items : rowsToSpec(p.items));

// Khoá bước con ảnh trạng thái thứ idx của một món: theo mô tả món (không theo node), món giống hệt ở workflow khác dùng lại ảnh.
export const propStepKey = (providerId: string, item: PropSpecItem, idx: number): unknown[] => [
  "prop",
  providerId,
  item.name,
  item.description,
  item.states.slice(0, idx + 1),
  DEFAULT_LOOK,
];

// Danh sách món khi ước tính: nối Biên kịch mà chưa biết kết quả thì undefined (src/core/estimate.ts ghi "chưa biết").
function knownSpec(p: PropsParams, connected: ReadonlySet<string>, known: EstimateKnown | undefined): PropSpecItem[] | undefined {
  if (!connected.has("spec")) return specOf(p, undefined);
  const fromWriter = known ? pickInput(known.inputs, "spec", "propspec") : undefined;
  return fromWriter ? specOf(p, fromWriter) : undefined;
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
  // 1 ảnh mỗi trạng thái mỗi món, trừ ảnh đã có trong cache bước con.
  estimate(p, connected, known) {
    const spec = knownSpec(p, connected, known) ?? [];
    const image = spec.reduce((n, item) => n + item.states.filter((_, idx) => known?.step(propStepKey(p.provider, item, idx)) === undefined).length, 0);
    return { image, video: 0, text: 0 };
  },
  predict(p, known) {
    const spec = knownSpec(p, new Set(Object.keys(known.inputs)), known);
    if (!spec) return undefined;
    const items: PropItem[] = [];
    for (const item of spec) {
      const images: PropItem["images"] = [];
      for (const [idx, state] of item.states.entries()) {
        const mediaId = mediaIdOf(known.step(propStepKey(p.provider, item, idx)));
        if (mediaId === undefined) return undefined;
        images.push({ mediaId, state });
      }
      items.push({ name: item.name, description: item.description, images });
    }
    return { props: { kind: "props", items } };
  },
});
