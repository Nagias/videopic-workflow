import { requireInput, type NodeRun, type NodeRunContext } from "../../core/node-runtime";
import type { ChatSessionRef, ImageReference, MediaProvider, ProviderContext } from "../../providers/types";
import { checkShotList, composeInChatKeyframePrompt, composeKeyframePrompt, composeMotionPrompt, type Shot } from "../../shared/director";
import type { ImageSetValue, StoryboardShot } from "../../shared/ports";
import { CHAIN_TRIM_SEC, LAST_FRAME_FROM_END_SEC, SHOT_SECONDS, type FilmParams } from "./definition";

type FinishedShot = { clipId: string; durationSec: number; trimStartSec: number; hasAudio: boolean };

function semaphore(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return {
    async acquire() {
      if (active < max) {
        active++;
        return;
      }
      await new Promise<void>((r) => waiting.push(r));
      active++;
    },
    release() {
      active--;
      waiting.shift()?.();
    },
  };
}

export function referencesFor(shot: Shot, character: ImageSetValue, location: ImageSetValue): ImageReference[] {
  const pick = (set: ImageSetValue, views: string[]) =>
    views.flatMap((v) => set.images.filter((i) => i.view === v)).map((i) => ({ mediaId: i.mediaId, role: set.role }));
  const loc = pick(location, ["wide", "close"]);
  return shot.subject === "character" ? [...pick(character, ["front", "full-body"]), ...loc.slice(0, 1)] : loc;
}

async function lastFrameOf(ctx: NodeRunContext, clipId: string): Promise<string> {
  const rec = ctx.storage.getMedia(clipId);
  if (!rec) throw new Error(`Không tìm thấy clip ${clipId} để lấy khung cuối`);
  const out = await ctx.storage.tmpPath("jpg");
  await ctx.ffmpeg.extractFrame(ctx.storage.absPath(rec), out, { fromEndSec: LAST_FRAME_FROM_END_SEC });
  return (await ctx.storage.importFile(out, { kind: "image", source: "last-frame", width: 1280, height: 720 })).id;
}

async function fixBrightness(ctx: NodeRunContext, clipId: string): Promise<string> {
  const rec = ctx.storage.getMedia(clipId);
  if (!rec) throw new Error(`Không tìm thấy clip ${clipId}`);
  const src = ctx.storage.absPath(rec);
  const probe = await ctx.ffmpeg.probeVideo(src);
  const startLuma = await ctx.ffmpeg.measureLuma(src, 0.1);
  const endLuma = await ctx.ffmpeg.measureLuma(src, Math.max(0, probe.durationSec - 0.2));
  const out = await ctx.storage.tmpPath("mp4");
  await ctx.ffmpeg.stabilizeBrightness(src, out, { startLuma, endLuma, durationSec: probe.durationSec });
  const fixed = await ctx.storage.importFile(out, { kind: "video", source: "brightness-fix", width: probe.width, height: probe.height, durationSec: probe.durationSec });
  return fixed.id;
}

export const run: NodeRun<FilmParams> = async (ctx, inputs, params) => {
  const character = requireInput(inputs, "character", "imageset");
  const location = requireInput(inputs, "location", "imageset");
  const { shots } = requireInput(inputs, "shots", "shotlist");
  const check = checkShotList(shots);
  if (check.errors.length) throw new Error(check.errors.join("; "));

  const provider: MediaProvider = ctx.providers.get(params.provider);
  const board: StoryboardShot[] = shots.map((s) => ({ shotId: s.id, status: "pending" }));
  const publish = () => {
    const done = board.filter((b) => b.status === "done").length;
    const running = board.map((b, i) => (b.status === "running" ? i + 1 : 0)).filter(Boolean);
    ctx.report(`Xong ${done}/${shots.length} cảnh${running.length ? ` · đang chạy cảnh ${running.join(", ")}` : ""}`);
    ctx.partial({ storyboard: { kind: "storyboard", shots: board.map((b) => ({ ...b })) } });
  };
  const sem = semaphore(Math.max(1, provider.maxParallel()));
  const characterChat = semaphore(1);
  let session: ChatSessionRef | undefined = character.session;
  const locationRefs = location.images.filter((x) => x.view === "wide").map((x) => ({ mediaId: x.mediaId, role: location.role }));

  const characterKeyframe = async (i: number, shot: Shot): Promise<{ mediaId: string }> => {
    const prompt = composeInChatKeyframePrompt(shot, location.description);
    const fallbackRefs = referencesFor(shot, character, location);
    const fallbackPrompt = composeKeyframePrompt(shot, character.description, location.description);
    return ctx.step(["keyframe-chat", provider.id, prompt, character.images.map((x) => x.mediaId), locationRefs.map((x) => x.mediaId)], async () => {
      await characterChat.acquire();
      try {
        const img = await provider.generateImage(
          { prompt, references: locationRefs, session: session ?? "new", fallback: { prompt: fallbackPrompt, references: fallbackRefs } },
          shotCtx(i),
        );
        if (img.session) session = img.session;
        return { mediaId: img.mediaId };
      } finally {
        characterChat.release();
      }
    });
  };
  const shotCtx = (i: number): ProviderContext => ({
    signal: ctx.signal,
    report: (m) => {
      board[i]!.note = m;
      ctx.partial({ storyboard: { kind: "storyboard", shots: board.map((b) => ({ ...b })) } });
    },
    storage: ctx.storage,
    ffmpeg: ctx.ffmpeg,
  });

  const results: Promise<FinishedShot>[] = [];
  shots.forEach((shot, i) => {
    results.push(
      (async () => {
        let prev: FinishedShot | undefined;
        if (shot.link === "chain") {
          prev = await results[i - 1]!.catch((err: unknown) => {
            board[i] = { shotId: shot.id, status: "skipped", error: `Bỏ qua vì nối với cảnh ${i} đã lỗi` };
            throw err;
          });
        }
        await sem.acquire();
        try {
          board[i] = { shotId: shot.id, status: "running" };
          publish();
          const keyframe = prev
            ? await ctx.step(["chain-frame", prev.clipId], async () => ({ mediaId: await lastFrameOf(ctx, prev.clipId) }))
            : shot.subject === "character" && session
              ? await characterKeyframe(i, shot)
              : await ctx.step(
                ["keyframe", provider.id, composeKeyframePrompt(shot, character.description, location.description), referencesFor(shot, character, location)],
                async () => {
                  const img = await provider.generateImage(
                    { prompt: composeKeyframePrompt(shot, character.description, location.description), references: referencesFor(shot, character, location) },
                    shotCtx(i),
                  );
                  return { mediaId: img.mediaId };
                },
              );
          board[i].keyframeId = keyframe.mediaId;
          publish();

          const motion = composeMotionPrompt(shot);
          const clip = await ctx.step(["clip", provider.id, motion, keyframe.mediaId, SHOT_SECONDS], async () => {
            const v = await provider.generateVideo({ prompt: motion, durationSec: SHOT_SECONDS, firstFrameMediaId: keyframe.mediaId }, shotCtx(i));
            return { mediaId: v.mediaId, durationSec: v.durationSec };
          });
          const finalId = params.fixBrightness
            ? (await ctx.step(["brightness", clip.mediaId], async () => ({ mediaId: await fixBrightness(ctx, clip.mediaId) }))).mediaId
            : clip.mediaId;
          const probe = await ctx.ffmpeg.probeVideo(ctx.storage.absPath(ctx.storage.getMedia(finalId)!));
          board[i] = { shotId: shot.id, status: "done", keyframeId: keyframe.mediaId, clipId: finalId };
          publish();
          const trim = shot.link === "chain" ? CHAIN_TRIM_SEC : 0;
          return { clipId: finalId, trimStartSec: trim, durationSec: Math.min(probe.durationSec, SHOT_SECONDS) - trim, hasAudio: probe.hasAudio };
        } catch (err) {
          board[i] = { ...board[i]!, status: "failed", error: err instanceof Error ? err.message : String(err) };
          publish();
          throw err;
        } finally {
          sem.release();
        }
      })(),
    );
  });

  const settled = await Promise.allSettled(results);
  publish();
  const failed = board.map((b, i) => (b.status === "failed" || b.status === "skipped" ? `Cảnh ${i + 1}: ${b.error ?? "lỗi"}` : null)).filter(Boolean);
  if (failed.length) {
    throw new Error(`${failed.length}/${shots.length} cảnh chưa xong (các cảnh đã xong được giữ lại, bấm Chạy để làm tiếp). ${failed.join(" | ")}`);
  }
  const parts = settled.map((s) => (s as PromiseFulfilledResult<FinishedShot>).value);

  ctx.report(`Ghép ${parts.length} cảnh…`);
  const film = await ctx.step(["concat", parts], async () => {
    const out = await ctx.storage.tmpPath("mp4");
    await ctx.ffmpeg.concatClips(
      parts.map((p) => ({ path: ctx.storage.absPath(ctx.storage.getMedia(p.clipId)!), trimStartSec: p.trimStartSec, durationSec: p.durationSec, hasAudio: p.hasAudio })),
      out,
    );
    const probe = await ctx.ffmpeg.probeVideo(out);
    const rec = await ctx.storage.importFile(out, { kind: "video", source: "film", width: probe.width, height: probe.height, durationSec: probe.durationSec });
    return { mediaId: rec.id, durationSec: probe.durationSec, width: probe.width, height: probe.height };
  });
  ctx.report(`Xong: ${shots.length} cảnh, ${film.durationSec.toFixed(1)} giây`);
  return {
    video: { kind: "video", mediaId: film.mediaId, durationSec: film.durationSec, width: film.width, height: film.height },
    storyboard: { kind: "storyboard", shots: board },
  };
};
