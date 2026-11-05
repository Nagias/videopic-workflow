import { z } from "zod";
import { checkShotList, ShotSchema, type KnownProp, type Shot } from "./director";
import { propSpecProblems, PropSpecItemSchema, type PropSpecItem } from "./ports";

// Đọc câu trả lời chữ của Biên kịch: lấy khối JSON, kiểm cấu trúc và luật đạo diễn (cùng luật với Danh sách cảnh).

export const WriterOutputSchema = z.object({
  props: z.array(PropSpecItemSchema),
  shots: z.array(ShotSchema).min(1, "kịch bản chưa có cảnh nào"),
});
export type WriterOutput = { props: PropSpecItem[]; shots: Shot[] };

export function extractJsonBlock(text: string): unknown {
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]!.trim()).filter((b) => b.startsWith("{"));
  const raw = fences.at(-1) ?? (text.includes("{") && text.includes("}") ? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1) : null);
  if (!raw) throw new Error("không tìm thấy khối JSON trong câu trả lời");
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    throw new Error(`khối JSON viết sai cú pháp (${err instanceof Error ? err.message : String(err)})`, { cause: err });
  }
}

// Biên kịch hay bỏ sót mã cảnh / trường đồ vật → tự điền, không bắt viết lại chỉ vì chuyện đó.
function fillDefaults(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const v = value as { shots?: unknown; props?: unknown };
  const shots: unknown = Array.isArray(v.shots)
    ? (v.shots as unknown[]).map((s, i): unknown => {
        if (!s || typeof s !== "object") return s;
        const shot: Record<string, unknown> = { props: "", start: "", ...(s as Record<string, unknown>) };
        return { ...shot, id: typeof shot.id === "string" && shot.id ? shot.id : `c${String(i + 1).padStart(2, "0")}` };
      })
    : v.shots;
  return { props: [], ...v, shots };
}

export type WriterParse = { ok: true; value: WriterOutput } | { ok: false; errors: string[] };

// products: sản phẩm có ảnh thật nối vào Biên kịch. Cảnh được dùng sản phẩm (đúng tên, đúng trạng thái), nhưng "props" của
// kịch bản không được khai báo lại sản phẩm (cổng ra props chỉ là đồ phụ, node Đồ vật nối từ đây sẽ không vẽ lại sản phẩm).
export function parseWriterReply(text: string, products: KnownProp[] = []): WriterParse {
  let json: unknown;
  try {
    json = fillDefaults(extractJsonBlock(text));
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  }
  const parsed = WriterOutputSchema.safeParse(json);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const isProduct = (name: string) => products.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  const redefined = parsed.data.props.filter((p) => isProduct(p.name)).map((p) => `Đồ vật "${p.name}" là sản phẩm đã có ảnh thật, không được khai báo lại trong "props"`);
  const known = [...products, ...parsed.data.props.filter((p) => !isProduct(p.name)).map((p) => ({ name: p.name, states: p.states }))];
  const errors = [...redefined, ...propSpecProblems(parsed.data.props), ...checkShotList(parsed.data.shots, known).errors];
  return errors.length ? { ok: false, errors } : { ok: true, value: parsed.data };
}
