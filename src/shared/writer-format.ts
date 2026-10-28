import { z } from "zod";
import { checkShotList, ShotSchema, type Shot } from "./director";
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

export function parseWriterReply(text: string): WriterParse {
  let json: unknown;
  try {
    json = fillDefaults(extractJsonBlock(text));
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  }
  const parsed = WriterOutputSchema.safeParse(json);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const known = parsed.data.props.map((p) => ({ name: p.name, states: p.states }));
  const errors = [...propSpecProblems(parsed.data.props), ...checkShotList(parsed.data.shots, known).errors];
  return errors.length ? { ok: false, errors } : { ok: true, value: parsed.data };
}
