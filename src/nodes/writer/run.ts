import type { NodeRun } from "../../core/node-runtime";
import type { ChatSessionRef } from "../../providers/types";
import { repairPrompt, writerPrompt } from "../../shared/prompts";
import { parseWriterReply, WriterOutputSchema } from "../../shared/writer-format";
import { WRITER_MAX_TRIES, type WriterParams } from "./definition";

export const run: NodeRun<WriterParams> = async (ctx, inputs, params) => {
  const provider = ctx.providers.get(params.provider);
  const character = inputs.character?.kind === "imageset" ? inputs.character.description : undefined;
  const location = inputs.location?.kind === "imageset" ? inputs.location.description : undefined;
  const prompt = writerPrompt({ idea: params.idea, shotCount: params.shotCount, character, location });
  const pctx = { signal: ctx.signal, report: (m: string) => ctx.report(`Biên kịch: ${m}`), storage: ctx.storage, ffmpeg: ctx.ffmpeg };

  const result = await ctx.step(["writer", provider.id, prompt], async () => {
    let session: ChatSessionRef | undefined;
    let errors: string[] = [];
    for (let attempt = 1; attempt <= WRITER_MAX_TRIES; attempt++) {
      const ask = attempt === 1 ? prompt : repairPrompt(errors);
      // Chat cũ hỏng thì chat mới không biết lời trước → gửi lại yêu cầu gốc kèm lỗi cần tránh.
      const fallbackPrompt = attempt === 1 ? undefined : `${prompt}\n\nLần trước bị lỗi, hãy tránh:\n${errors.map((e) => `- ${e}`).join("\n")}`;
      const reply = await provider.generateText({ prompt: ask, ...(session ? { session } : {}), ...(fallbackPrompt ? { fallbackPrompt } : {}) }, pctx);
      session = reply.session;
      const parsed = parseWriterReply(reply.text);
      if (parsed.ok) return { json: JSON.stringify(parsed.value) };
      errors = parsed.errors;
      ctx.report(`Biên kịch: lần ${attempt} chưa đạt (${errors.length} lỗi)${attempt < WRITER_MAX_TRIES ? ", nhờ sửa…" : ""}`);
    }
    throw new Error(`Biên kịch chưa ra danh sách cảnh hợp lệ sau ${WRITER_MAX_TRIES} lần. Lỗi lần cuối: ${errors.join("; ")}`);
  });

  const value = WriterOutputSchema.parse(JSON.parse(result.json));
  ctx.report(`Biên kịch: ${value.shots.length} cảnh, ${value.props.length} đồ vật`);
  return { shots: { kind: "shotlist", shots: value.shots }, props: { kind: "propspec", items: value.props } };
};
