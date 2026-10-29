import { optionalInput, requireInput, type NodeRun, type NodeRunContext } from "../../core/node-runtime";
import { ServiceBreakerOpen } from "../../core/run-shared";
import { semaphore } from "../../core/semaphore";
import { ProviderError, type ChatSessionRef, type ImageReference, type MediaProvider, type ProviderContext } from "../../providers/types";
import { checkShotList, MAX_PROP_REFS, parsePropLines, type Shot } from "../../shared/director";
import type { ImageSetValue, PropSetValue, StoryboardShot } from "../../shared/ports";
import { DEFAULT_LOOK, keyframePrompt, motionPrompt, textVideoPrompt, type KeyframeCtx } from "../../shared/prompts";
import { CHAIN_TRIM_SEC, LAST_FRAME_FROM_END_SEC, SERVICE_FAILURE_LIMIT, SHOT_SECONDS, type FilmParams } from "./definition";

const SERVICE_FAILURE_CODES = new Set(["MUSE_FAILED", "NO_MEDIA"]);

type Brightness = { startLuma: number; endLuma: number; clipSec: number };
type FinishedShot = { clipId: string; durationSec: number; trimStartSec: number; hasAudio: boolean; brightness?: Brightness };
type Refs = { refs: ImageReference[]; captions: string[] };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Đồ vật trong khung: mô tả cho prompt (mọi món) + ảnh mẫu đúng trạng thái đầu (tối đa MAX_PROP_REFS, ưu tiên món đổi trạng thái).
function propsInFrame(shot: Shot, props: PropSetValue | undefined): { described: KeyframeCtx["props"]; attached: Refs } {
  const uses = parsePropLines(shot.props).items;
  const described = uses.map((u) => ({ name: u.name, state: u.from, description: props?.items.find((p) => same(p.name, u.name))?.description ?? "" }));
  const ordered = [...uses].sort((a, b) => Number(Boolean(b.to && !same(b.to, b.from))) - Number(Boolean(a.to && !same(a.to, a.from))));
  const attached: Refs = { refs: [], captions: [] };
  for (const u of ordered) {
    if (attached.refs.length >= MAX_PROP_REFS) break;
    const img = props?.items.find((p) => same(p.name, u.name))?.images.find((x) => same(x.state, u.from));
    if (!img) continue;
    attached.refs.push({ mediaId: img.mediaId, role: "prop" });
    attached.captions.push(`${u.name} (${u.from})`);
  }
  return { described, attached };
}

const pickView = (set: ImageSetValue, view: string): ImageReference[] =>
  set.images.filter((i) => i.view === view).map((i) => ({ mediaId: i.mediaId, role: set.role }));

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

export const run: NodeRun<FilmParams> = async (ctx, inputs, params) => {
  const character = requireInput(inputs, "character", "imageset");
  const location = requireInput(inputs, "location", "imageset");
  const { shots } = requireInput(inputs, "shots", "shotlist");
  const props = optionalInput(inputs, "props", "props");
  const known = props?.items.map((p) => ({ name: p.name, states: p.images.map((x) => x.state) }));
  const check = checkShotList(shots, known);
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
  let serviceFailures = 0;
  const ensureServiceUp = () => {
    if (serviceFailures >= SERVICE_FAILURE_LIMIT) throw new ServiceBreakerOpen(SERVICE_FAILURE_LIMIT);
  };
  let session: ChatSessionRef | undefined = character.session;
  const look = location.look ?? DEFAULT_LOOK;
  const locationRef = pickView(location, "wide");
  const shotCtx = (i: number): ProviderContext => ({
    signal: ctx.signal,
    report: (m) => {
      board[i]!.note = m;
      ctx.partial({ storyboard: { kind: "storyboard", shots: board.map((b) => ({ ...b })) } });
    },
    storage: ctx.storage,
    ffmpeg: ctx.ffmpeg,
  });

  const image = async (keyParts: unknown[], make: () => Promise<{ mediaId: string }>) =>
    ctx.step(["keyframe", provider.id, ...keyParts], async () => {
      ensureServiceUp();
      return make();
    });

  // Ảnh khung: có người → nối tiếp trong chat phụ của nhân vật; không người → chat mới, đính kèm bối cảnh + đồ vật.
  const keyframeFor = async (i: number, shot: Shot): Promise<{ mediaId: string }> => {
    const { described, attached } = propsInFrame(shot, props);
    const base: Omit<KeyframeCtx, "refs" | "inChat"> = { look, location: location.description, props: described, character: character.description };
    const refs = [...locationRef, ...attached.refs];
    const captions = [...locationRef.map(() => "bối cảnh"), ...attached.captions];
    if (shot.subject !== "none" && session) {
      const prompt = keyframePrompt(shot, { ...base, refs: captions, inChat: true });
      const fbRefs = [...pickView(character, "face"), ...pickView(character, "front"), ...refs];
      const fbCaptions = [...pickView(character, "face").map(() => "nhân vật (mặt)"), ...pickView(character, "front").map(() => "nhân vật (toàn thân)"), ...captions];
      const fallback = { prompt: keyframePrompt(shot, { ...base, refs: fbCaptions, inChat: false }), references: fbRefs };
      return image(["chat", prompt, character.images.map((x) => x.mediaId), refs.map((r) => r.mediaId)], async () => {
        await characterChat.acquire();
        try {
          ensureServiceUp();
          const img = await provider.generateImage({ prompt, references: refs, session: session ?? "new", fallback, verbatim: true }, shotCtx(i));
          if (img.session) session = img.session;
          return { mediaId: img.mediaId };
        } finally {
          characterChat.release();
        }
      });
    }
    const withPerson = shot.subject !== "none";
    const allRefs = withPerson ? [...pickView(character, "face"), ...pickView(character, "front"), ...refs] : refs;
    const allCaptions = withPerson ? [...pickView(character, "face").map(() => "nhân vật (mặt)"), ...pickView(character, "front").map(() => "nhân vật (toàn thân)"), ...captions] : captions;
    const prompt = keyframePrompt(shot, { ...base, refs: allCaptions, inChat: false });
    return image(["new", prompt, allRefs.map((r) => r.mediaId)], async () => {
      const img = await provider.generateImage({ prompt, references: allRefs, session: "new", verbatim: true }, shotCtx(i));
      return { mediaId: img.mediaId };
    });
  };

  const textOnly = (shot: Shot) => shot.link === "cut" && shot.subject === "none" && parsePropLines(shot.props).items.length === 0;

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
          let keyframeId: string | undefined;
          let clip: { mediaId: string };
          if (textOnly(shot)) {
            // Cảnh không người, không đồ vật: chữ→video thẳng (đo 28/10: thật nhất), ảnh xem trước rút từ clip.
            const prompt = textVideoPrompt(shot, { look, location: location.description });
            clip = await ctx.step(["clip-text", provider.id, prompt, SHOT_SECONDS], async () => {
              ensureServiceUp();
              const v = await provider.generateVideo({ prompt, durationSec: SHOT_SECONDS, verbatim: true }, shotCtx(i));
              return { mediaId: v.mediaId };
            });
            keyframeId = (await ctx.step(["thumb", clip.mediaId], async () => ({ mediaId: await frameOf(ctx, clip.mediaId, SHOT_SECONDS - 0.5, "thumb") }))).mediaId;
          } else {
            const keyframe = prev
              ? await ctx.step(["chain-frame", prev.clipId], async () => ({ mediaId: await frameOf(ctx, prev.clipId, LAST_FRAME_FROM_END_SEC, "last-frame") }))
              : await keyframeFor(i, shot);
            keyframeId = keyframe.mediaId;
            board[i] = { ...board[i], keyframeId };
            publish();
            const prompt = motionPrompt(shot, { character: character.description });
            clip = await ctx.step(["clip", provider.id, prompt, keyframe.mediaId, SHOT_SECONDS], async () => {
              ensureServiceUp();
              const v = await provider.generateVideo({ prompt, durationSec: SHOT_SECONDS, firstFrameMediaId: keyframe.mediaId, verbatim: true }, shotCtx(i));
              return { mediaId: v.mediaId };
            });
          }
          const brightness = params.fixBrightness ? await ctx.step(["luma", clip.mediaId], () => measureBrightness(ctx, clip.mediaId)) : undefined;
          const probe = await ctx.ffmpeg.probeVideo(ctx.storage.absPath(ctx.storage.getMedia(clip.mediaId)!));
          board[i] = { shotId: shot.id, status: "done", keyframeId, clipId: clip.mediaId };
          publish();
          const trim = shot.link === "chain" ? CHAIN_TRIM_SEC : 0;
          return {
            clipId: clip.mediaId,
            trimStartSec: trim,
            durationSec: Math.min(probe.durationSec, SHOT_SECONDS) - trim,
            hasAudio: probe.hasAudio,
            ...(brightness ? { brightness } : {}),
          };
        } catch (err) {
          if (err instanceof ProviderError && SERVICE_FAILURE_CODES.has(err.code)) serviceFailures++;
          const tripped = err instanceof ServiceBreakerOpen;
          board[i] = { ...board[i]!, status: tripped ? "skipped" : "failed", error: err instanceof Error ? err.message : String(err) };
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
  ctx.report(`Xong: ${shots.length} cảnh, ${film.durationSec.toFixed(1)} giây`);
  return {
    video: { kind: "video", mediaId: film.mediaId, durationSec: film.durationSec, width: film.width, height: film.height },
    storyboard: { kind: "storyboard", shots: board },
  };
};
