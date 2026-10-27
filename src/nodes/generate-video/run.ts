import { requireInput, type NodeRun } from "../../core/node-runtime";
import type { GenerateVideoParams } from "./definition";

export const run: NodeRun<GenerateVideoParams> = async (ctx, inputs, params) => {
  const prompt = requireInput(inputs, "prompt", "text");
  const provider = ctx.providers.get(params.provider);
  ctx.report(`Đang gửi cho ${params.provider}…`);
  const video = await provider.generateVideo(
    { prompt: prompt.text, durationSec: params.durationSec },
    { signal: ctx.signal, report: (m) => ctx.report(m), storage: ctx.storage, ffmpeg: ctx.ffmpeg },
  );
  return { video: { kind: "video", ...video } };
};
