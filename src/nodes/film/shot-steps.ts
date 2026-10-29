import type { NodeRunContext } from "../../core/node-runtime";
import type { MediaProvider, ProviderContext } from "../../providers/types";
import { SHOT_SECONDS, textOnly, type Shot } from "../../shared/director";
import type { ImageSetValue, PropSetValue } from "../../shared/ports";
import { chainFrameKey, clipStep, keyframeStep, textClipStep, thumbKey } from "../../shared/shot-plan";
import { CHAIN_TRIM_SEC, LAST_FRAME_FROM_END_SEC } from "./definition";

// Tạo một cảnh: dùng chung cho Dựng phim (film) và Cảnh (scene). Hai node cùng stepScope "film"; khoá và prompt
// của các bước gọi dịch vụ lấy từ src/shared/shot-plan.ts (ước tính lượt dùng đúng các khoá đó).

export type Brightness = { startLuma: number; endLuma: number; clipSec: number };
export type ShotResult = { keyframeId: string; clipId: string; durationSec: number; trimStartSec: number; hasAudio: boolean; brightness?: Brightness };

export type ShotArgs = {
  shot: Shot;
  provider: MediaProvider;
  character: ImageSetValue;
  location: ImageSetValue;
  props?: PropSetValue;
  // Cảnh nối (link "chain"): clip của cảnh trước, lấy khung cuối làm khung đầu.
  prevClipId?: string;
  // Đo độ sáng đầu/cuối clip (để Ghép phim bù sáng). Chỉ tốn ffmpeg, có cache.
  measure: boolean;
  // Tin tiến độ của dịch vụ (mặc định ctx.report) và báo khi đã có ảnh khung (trước khi tạo clip).
  report?: (message: string) => void;
  onKeyframe?: (keyframeId: string) => void;
};

async function frameOf(ctx: NodeRunContext, clipId: string, fromEndSec: number, source: string): Promise<string> {
  const rec = ctx.storage.getMedia(clipId);
  if (!rec) throw new Error(`Không tìm thấy clip ${clipId} để rút khung`);
  const out = await ctx.storage.tmpPath("jpg");
  await ctx.ffmpeg.extractFrame(ctx.storage.absPath(rec), out, { fromEndSec });
  return (await ctx.storage.importFile(out, { kind: "image", source, width: 1280, height: 720 })).id;
}

async function measureBrightness(ctx: NodeRunContext, clipId: string): Promise<Brightness> {
  const rec = ctx.storage.getMedia(clipId);
  if (!rec) throw new Error(`Không tìm thấy clip ${clipId}`);
  const src = ctx.storage.absPath(rec);
  const probe = await ctx.ffmpeg.probeVideo(src);
  const startLuma = await ctx.ffmpeg.measureLuma(src, 0.1);
  const endLuma = await ctx.ffmpeg.measureLuma(src, Math.max(0, probe.durationSec - 0.2));
  return { startLuma, endLuma, clipSec: probe.durationSec };
}

// Khung cuối của clip: cùng khoá với khung đầu của cảnh nối phía sau, nên rút một lần dùng cho cả hai.
export const lastFrameOf = (ctx: NodeRunContext, clipId: string): Promise<{ mediaId: string }> =>
  ctx.step(chainFrameKey(clipId), async () => ({ mediaId: await frameOf(ctx, clipId, LAST_FRAME_FROM_END_SEC, "last-frame") }));

// Mọi lần gọi dịch vụ đi qua đây: giữ một chỗ của dịch vụ (ctx.shared.slot) trong lúc gọi; lần chạy đã dừng
// hoặc cầu dao đã ngắt thì không gửi; lỗi máy chủ được đếm vào cầu dao trước khi trả chỗ cho cảnh đang chờ.
// Thứ tự khoá: khoá chat (nếu có) ở ngoài, chỗ dịch vụ ở trong; không bao giờ giữ chỗ dịch vụ trong lúc chờ khoá chat.
async function callProvider<T>(ctx: NodeRunContext, provider: MediaProvider, fn: () => Promise<T>): Promise<T> {
  return ctx.shared.slot(provider.id, async () => {
    ctx.signal.throwIfAborted();
    ctx.shared.breaker.check();
    try {
      return await fn();
    } catch (err) {
      ctx.shared.breaker.record(err);
      throw err;
    }
  });
}

// Ảnh khung theo keyframeStep() (src/shared/shot-plan.ts): trong chat phụ của nhân vật (khoá chat chung cả máy chủ), hoặc chat mới.
async function keyframeFor(ctx: NodeRunContext, a: ShotArgs, pctx: ProviderContext): Promise<{ mediaId: string }> {
  const { provider } = a;
  const plan = keyframeStep({ shot: a.shot, providerId: provider.id, character: a.character, location: a.location, props: a.props });
  const { chat } = plan;
  if (chat) {
    // Chat phụ của nhân vật chỉ làm từng việc một, khoá theo đường dẫn chat gốc (chung cả máy chủ).
    return ctx.step(plan.keyParts, () =>
      ctx.shared.chat.with(chat.session.threadUrl, () =>
        callProvider(ctx, provider, async () => {
          const img = await provider.generateImage({ prompt: plan.prompt, references: plan.references, session: ctx.shared.session(chat.session), fallback: chat.fallback, verbatim: true }, pctx);
          if (img.session) ctx.shared.updateSession(chat.session, img.session);
          return { mediaId: img.mediaId };
        }),
      ),
    );
  }
  return ctx.step(plan.keyParts, () =>
    callProvider(ctx, provider, async () => {
      const img = await provider.generateImage({ prompt: plan.prompt, references: plan.references, session: "new", verbatim: true }, pctx);
      return { mediaId: img.mediaId };
    }),
  );
}

// Một clip trong phim: phần dùng khi ghép (đã cắt đầu) và độ sáng để bù (chỉ khi bật bù sáng).
export type FilmPart = { clipId: string; trimStartSec: number; durationSec: number; hasAudio: boolean; brightness?: Brightness };

// Ghép phim: Dựng phim và Ghép phim dùng chung bước con ["concat", parts] (cùng stepScope "film"),
// nên cùng các phần (giá trị và trường có mặt) thì ra đúng một file, không ghép lại.
export const concatParts = (ctx: NodeRunContext, parts: FilmPart[]): Promise<{ mediaId: string; durationSec: number; width: number; height: number }> =>
  ctx.step(["concat", parts], async () => {
    const out = await ctx.storage.tmpPath("mp4");
    await ctx.ffmpeg.concatClips(
      parts.map((p) => ({
        path: ctx.storage.absPath(ctx.storage.getMedia(p.clipId)!),
        trimStartSec: p.trimStartSec,
        durationSec: p.durationSec,
        hasAudio: p.hasAudio,
        ...(p.brightness ? { brightness: p.brightness } : {}),
      })),
      out,
    );
    const probe = await ctx.ffmpeg.probeVideo(out);
    const rec = await ctx.storage.importFile(out, { kind: "video", source: "film", width: probe.width, height: probe.height, durationSec: probe.durationSec });
    return { mediaId: rec.id, durationSec: probe.durationSec, width: probe.width, height: probe.height };
  });

export async function makeShot(ctx: NodeRunContext, a: ShotArgs): Promise<ShotResult> {
  const { shot, provider, character, location } = a;
  const pctx: ProviderContext = { signal: ctx.signal, report: a.report ?? ((m) => ctx.report(m)), storage: ctx.storage, ffmpeg: ctx.ffmpeg };

  let keyframeId: string;
  let clip: { mediaId: string };
  if (textOnly(shot)) {
    // Ảnh xem trước rút từ clip.
    const plan = textClipStep(shot, provider.id, location);
    clip = await ctx.step(plan.keyParts, () =>
      callProvider(ctx, provider, async () => {
        const v = await provider.generateVideo({ prompt: plan.prompt, durationSec: SHOT_SECONDS, verbatim: true }, pctx);
        return { mediaId: v.mediaId };
      }),
    );
    keyframeId = (await ctx.step(thumbKey(clip.mediaId), async () => ({ mediaId: await frameOf(ctx, clip.mediaId, SHOT_SECONDS - 0.5, "thumb") }))).mediaId;
  } else {
    let keyframe: { mediaId: string };
    if (shot.link === "chain") {
      if (!a.prevClipId) throw new Error("Cảnh nối tiếp chưa có clip của cảnh trước");
      keyframe = await lastFrameOf(ctx, a.prevClipId);
    } else {
      keyframe = await keyframeFor(ctx, a, pctx);
    }
    keyframeId = keyframe.mediaId;
    a.onKeyframe?.(keyframeId);
    const plan = clipStep(shot, provider.id, character, keyframe.mediaId);
    clip = await ctx.step(plan.keyParts, () =>
      callProvider(ctx, provider, async () => {
        const v = await provider.generateVideo({ prompt: plan.prompt, durationSec: SHOT_SECONDS, firstFrameMediaId: keyframe.mediaId, verbatim: true }, pctx);
        return { mediaId: v.mediaId };
      }),
    );
  }
  const brightness = a.measure ? await ctx.step(["luma", clip.mediaId], () => measureBrightness(ctx, clip.mediaId)) : undefined;
  const rec = ctx.storage.getMedia(clip.mediaId);
  if (!rec) throw new Error(`Không tìm thấy clip ${clip.mediaId}`);
  const probe = await ctx.ffmpeg.probeVideo(ctx.storage.absPath(rec));
  const trim = shot.link === "chain" ? CHAIN_TRIM_SEC : 0;
  return {
    keyframeId,
    clipId: clip.mediaId,
    trimStartSec: trim,
    durationSec: Math.min(probe.durationSec, SHOT_SECONDS) - trim,
    hasAudio: probe.hasAudio,
    ...(brightness ? { brightness } : {}),
  };
}
