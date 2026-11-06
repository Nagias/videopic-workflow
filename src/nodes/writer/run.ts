import { optionalInput, type NodeRun, type NodeRunContext } from "../../core/node-runtime";
import { askText } from "../../core/text-ask";
import type { ChatSessionRef, MediaProvider } from "../../providers/types";
import { BATCH_SIZE, episodeContinuePrompt, episodeFallbackPrompt, episodeRepairPrompt, episodeWriterPrompt, type EpisodeWriterArgs } from "../../shared/cartoon-prompts";
import type { Shot } from "../../shared/director";
import { parseEpisodeBatch, type EpisodeBatch } from "../../shared/episode-format";
import { propStates, type ImageSetValue, type NodeOutputs, type OutlineValue, type PropSpecItem } from "../../shared/ports";
import { productWriterPrompt, repairPrompt } from "../../shared/prompts";
import { isCartoon, type CartoonStyle } from "../../shared/styles";
import { parseWriterReply, WriterOutputSchema } from "../../shared/writer-format";
import { IDEA_MIN, IDEA_TOO_SHORT, WRITER_MAX_TRIES, type WriterParams } from "./definition";

// Phim hoạt hình (thiết kế 2026-11-06 mục 3.4): viết từng đợt ≤ BATCH_SIZE cảnh trong cùng một chat (câu trả lời không quá
// dài để Muse cắt cụt), mỗi đợt một bước con có cache (đợt lỗi thì chạy lại chỉ làm từ đợt đó). Đợt sau nhắc cuối cảnh trước.
async function writeEpisode(
  ctx: NodeRunContext,
  provider: MediaProvider,
  cast: ImageSetValue & { style: CartoonStyle },
  w: EpisodeWriterArgs,
): Promise<NodeOutputs> {
  const first = episodeWriterPrompt(w, 1, Math.min(BATCH_SIZE, w.shotCount));
  const shots: Shot[] = [];
  const props: PropSpecItem[] = [];
  let session: ChatSessionRef | undefined;
  for (let from = 1; from <= w.shotCount; from += BATCH_SIZE) {
    const to = Math.min(from + BATCH_SIZE - 1, w.shotCount);
    const prompt = from === 1 ? first : episodeContinuePrompt(from, to, shots.at(-1)?.end ?? "", w.members);
    const fallbackPrompt = from === 1 ? undefined : episodeFallbackPrompt(w, from, to, shots.map((s) => ({ id: s.id, end: s.end ?? "" })), props);
    ctx.report(`Biên kịch: đợt cảnh ${from}–${to}/${w.shotCount}…`);
    const prev = [...shots];
    const known = [...props];
    const done = await ctx.step(["writer-batch", provider.id, first, from, to, JSON.stringify(prev)], async () => {
      const r = await askText<EpisodeBatch>(ctx, provider, {
        label: `Biên kịch đợt ${from}–${to}`,
        prompt,
        ...(session ? { session } : {}),
        ...(fallbackPrompt ? { fallbackPrompt } : {}),
        parse: (text) => parseEpisodeBatch(text, { from, to, members: w.members, prev, known }),
        repair: (errors) => episodeRepairPrompt(from, to, errors),
        maxTries: WRITER_MAX_TRIES,
      });
      return { json: JSON.stringify(r.value), accountId: r.session?.accountId ?? "", threadUrl: r.session?.threadUrl ?? "" };
    });
    const batch = JSON.parse(done.json) as EpisodeBatch;
    shots.push(...batch.shots);
    props.push(...batch.props);
    if (done.threadUrl) session = { accountId: done.accountId, threadUrl: done.threadUrl };
  }
  ctx.report(`Biên kịch: ${shots.length} cảnh, ${props.length} đồ vật`);
  return { shots: { kind: "shotlist", shots }, props: { kind: "propspec", items: props, style: cast.style } };
}

export const run: NodeRun<WriterParams> = async (ctx, inputs, params) => {
  const provider = ctx.providers.get(params.provider);
  const characterSet = optionalInput(inputs, "character", "imageset");
  const location = optionalInput(inputs, "location", "imageset")?.description;
  const outline: OutlineValue | undefined = optionalInput(inputs, "outline", "outline");

  if (isCartoon(characterSet?.style)) {
    const cast = characterSet as ImageSetValue & { style: CartoonStyle };
    if (!outline && params.idea.trim().length < IDEA_MIN) throw new Error(IDEA_TOO_SHORT);
    return writeEpisode(ctx, provider, cast, {
      members: cast.members ?? [],
      rules: cast.rules ?? "",
      ...(location ? { location } : {}),
      story: outline?.text ?? params.idea,
      shotCount: outline?.shotCount ?? params.shotCount,
    });
  }
  if (outline) throw new Error("Dàn ý dành cho phim hoạt hình: nối node Dàn nhân vật vào cổng Nhân vật của Biên kịch");
  if (params.idea.trim().length < IDEA_MIN) throw new Error(IDEA_TOO_SHORT);

  const character = characterSet?.description;
  const products = (optionalInput(inputs, "product", "props")?.items ?? []).map((i) => ({ name: i.name, description: i.description, states: propStates(i) }));
  // Không có sản phẩm: productWriterPrompt() trả đúng writerPrompt() cũ (khoá bước con không đổi).
  const prompt = productWriterPrompt({ idea: params.idea, shotCount: params.shotCount, character, location }, products);
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
      const parsed = parseWriterReply(reply.text, products);
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
