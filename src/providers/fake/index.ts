import { createHash } from "node:crypto";
import type { MediaProvider } from "../types";

const colorOf = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 6);

export function createFakeProvider(): MediaProvider {
  return {
    id: "fake",
    maxParallel: () => 2,

    async generateImage(req, ctx) {
      ctx.report("Đang tạo ảnh giả bằng ffmpeg…");
      const key = `${req.prompt}|${req.references.map((r) => r.mediaId).join(",")}`;
      const out = await ctx.storage.tmpPath("jpg");
      await ctx.ffmpeg.makeTestImage({ out, colorHex: colorOf(key), width: 1280, height: 720 });
      const rec = await ctx.storage.importFile(out, { kind: "image", source: "fake", width: 1280, height: 720 });
      return { mediaId: rec.id, width: 1280, height: 720 };
    },

    async generateVideo(req, ctx) {
      ctx.report("Đang tạo clip giả bằng ffmpeg…");
      const out = await ctx.storage.tmpPath("mp4");
      const first = req.firstFrameMediaId ? ctx.storage.getMedia(req.firstFrameMediaId) : undefined;
      if (req.firstFrameMediaId && !first) throw new Error(`Không tìm thấy ảnh khung ${req.firstFrameMediaId}`);
      if (first) {
        await ctx.ffmpeg.imageToClip({ image: ctx.storage.absPath(first), out, durationSec: req.durationSec });
      } else {
        await ctx.ffmpeg.makeTestClip({ out, durationSec: req.durationSec, colorHex: colorOf(req.prompt), width: 1280, height: 720 });
      }
      const probe = await ctx.ffmpeg.probeVideo(out);
      const rec = await ctx.storage.importFile(out, {
        kind: "video",
        source: "fake",
        width: probe.width,
        height: probe.height,
        durationSec: probe.durationSec,
      });
      return { mediaId: rec.id, durationSec: probe.durationSec, width: probe.width, height: probe.height };
    },
  };
}
