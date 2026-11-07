import type { ChatSessionRef, MediaProvider } from "../providers/types";
import type { NodeRunContext } from "./node-runtime";

type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export type AskText<T> = {
  label: string;
  prompt: string;
  // Chat để hỏi tiếp (đợt sau của Biên kịch); không có thì chat mới.
  session?: ChatSessionRef;
  // Chat cũ hỏng: chat mới không biết lời trước, gửi câu này (đủ bối cảnh) thay cho prompt.
  fallbackPrompt?: string;
  parse: (text: string) => Parsed<T>;
  repair: (errors: string[]) => string;
  maxTries: number;
};

// Hỏi dịch vụ bằng chữ, đọc câu trả lời; sai luật thì nhờ sửa trong cùng chat, tối đa maxTries lượt, hết lượt thì ném lỗi
// kèm lỗi lần cuối (không trả kết quả dở). Dùng cho Ý tưởng tập, Dàn ý, Biên kịch hoạt hình (thiết kế 2026-11-06).
export async function askText<T>(ctx: NodeRunContext, provider: MediaProvider, a: AskText<T>): Promise<{ value: T; session?: ChatSessionRef }> {
  const pctx = { signal: ctx.signal, report: (m: string) => ctx.report(`${a.label}: ${m}`), storage: ctx.storage, ffmpeg: ctx.ffmpeg };
  let session = a.session;
  let errors: string[] = [];
  for (let attempt = 1; attempt <= a.maxTries; attempt++) {
    const ask = attempt === 1 ? a.prompt : a.repair(errors);
    const base = a.fallbackPrompt ?? a.prompt;
    const fallbackPrompt = attempt === 1 ? a.fallbackPrompt : `${base}\n\nLần trước bị lỗi, hãy tránh:\n${errors.map((e) => `- ${e}`).join("\n")}`;
    const reply = await provider.generateText({ prompt: ask, ...(session ? { session } : {}), ...(fallbackPrompt ? { fallbackPrompt } : {}) }, pctx);
    session = reply.session ?? session;
    const parsed = a.parse(reply.text);
    if (parsed.ok) return { value: parsed.value, ...(session ? { session } : {}) };
    errors = parsed.errors;
    ctx.report(`${a.label}: lần ${attempt} chưa đạt (${errors.length} lỗi)${attempt < a.maxTries ? ", nhờ sửa…" : ""}`);
  }
  throw new Error(`${a.label} chưa ra kết quả hợp lệ sau ${a.maxTries} lần. Lỗi lần cuối: ${errors.slice(0, 8).join("; ")}`);
}
