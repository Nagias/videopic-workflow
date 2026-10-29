import { optionalInput, requireInput, type NodeRun } from "../../core/node-runtime";
import { ServiceBreakerOpen } from "../../core/run-shared";
import type { MediaProvider } from "../../providers/types";
import { checkShotList } from "../../shared/director";
import type { StoryboardShot } from "../../shared/ports";
import type { FilmParams } from "./definition";
import { makeShot, type ShotResult } from "./shot-steps";

// Điều phối: kiểm danh sách cảnh, chạy từng cảnh (makeShot) — cảnh nối chờ cảnh trước — rồi ghép.
// Giới hạn song song, khoá chat nhân vật và cầu dao nằm ở ctx.shared (chung cả lần chạy).
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
  const noteFor = (i: number) => (m: string) => {
    board[i]!.note = m;
    ctx.partial({ storyboard: { kind: "storyboard", shots: board.map((b) => ({ ...b })) } });
  };

  const results: Promise<ShotResult>[] = [];
  shots.forEach((shot, i) => {
    results.push(
      (async () => {
        let prev: ShotResult | undefined;
        if (shot.link === "chain") {
          prev = await results[i - 1]!.catch((err: unknown) => {
            board[i] = { shotId: shot.id, status: "skipped", error: `Bỏ qua vì nối với cảnh ${i} đã lỗi` };
            throw err;
          });
        }
        try {
          board[i] = { shotId: shot.id, status: "running" };
          publish();
          const done = await makeShot(ctx, {
            shot,
            provider,
            character,
            location,
            ...(props ? { props } : {}),
            ...(prev ? { prevClipId: prev.clipId } : {}),
            measure: params.fixBrightness,
            report: noteFor(i),
            onKeyframe: (keyframeId) => {
              board[i] = { ...board[i]!, keyframeId };
              publish();
            },
          });
          board[i] = { shotId: shot.id, status: "done", keyframeId: done.keyframeId, clipId: done.clipId };
          publish();
          return done;
        } catch (err) {
          const tripped = err instanceof ServiceBreakerOpen;
          board[i] = { ...board[i]!, status: tripped ? "skipped" : "failed", error: err instanceof Error ? err.message : String(err) };
          publish();
          throw err;
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
  // Khoá bước ghép giữ đúng dạng cũ (không có keyframeId) để phim đã ghép trước đây vẫn dùng lại được.
  const parts = settled.map((s) => {
    const r = (s as PromiseFulfilledResult<ShotResult>).value;
    return { clipId: r.clipId, trimStartSec: r.trimStartSec, durationSec: r.durationSec, hasAudio: r.hasAudio, ...(r.brightness ? { brightness: r.brightness } : {}) };
  });

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
