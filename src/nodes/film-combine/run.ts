import { requireInputs, type NodeRun } from "../../core/node-runtime";
import { SHOT_SECONDS } from "../film/definition";
import { concatParts, type FilmPart } from "../film/shot-steps";
import type { FilmCombineParams } from "./definition";

// Luật giữa các cảnh đã kiểm ở preflight (definition.ts) trước khi lần chạy bắt đầu; ở đây chỉ ghép.
export const run: NodeRun<FilmCombineParams> = async (ctx, inputs, params) => {
  const clips = requireInputs(inputs, "clips", "video");
  if (clips.length === 0) throw new Error("Chưa nối clip nào vào Ghép phim");

  // Phần tử giống hệt Dựng phim (src/nodes/film/run.ts) để phim cũ ghép từ cùng các cảnh dùng lại được:
  // clip của Cảnh (có `clip`) dùng min(thời lượng thật, SHOT_SECONDS) − cắt đầu, như ports.ts ghi;
  // video khác (không có `clip`, ví dụ video tải lên) dùng nguyên thời lượng thật, không cắt đầu, tiếng theo file.
  const parts: FilmPart[] = [];
  for (const v of clips) {
    if (v.clip) {
      const { trimStartSec, hasAudio, brightness } = v.clip;
      const durationSec = Math.min(v.durationSec, SHOT_SECONDS) - trimStartSec;
      parts.push({ clipId: v.mediaId, trimStartSec, durationSec, hasAudio, ...(params.fixBrightness && brightness ? { brightness } : {}) });
      continue;
    }
    const rec = ctx.storage.getMedia(v.mediaId);
    if (!rec) throw new Error(`Không tìm thấy video ${v.mediaId}`);
    const probe = await ctx.ffmpeg.probeVideo(ctx.storage.absPath(rec));
    parts.push({ clipId: v.mediaId, trimStartSec: 0, durationSec: probe.durationSec, hasAudio: probe.hasAudio });
  }

  ctx.report(`Ghép ${parts.length} clip…`);
  const film = await concatParts(ctx, parts);
  ctx.report(`Xong: ${parts.length} clip, ${film.durationSec.toFixed(1)} giây`);
  return { video: { kind: "video", mediaId: film.mediaId, durationSec: film.durationSec, width: film.width, height: film.height } };
};
