import { createHash } from "node:crypto";
import type { VideoProvider } from "../types";

export function createFakeProvider(): VideoProvider {
  return {
    id: "fake",
    async generateVideo(req, ctx) {
      ctx.report("Đang tạo clip giả bằng ffmpeg…");
      const colorHex = createHash("sha256").update(req.prompt).digest("hex").slice(0, 6);
      const out = await ctx.storage.tmpPath("mp4");
      await ctx.ffmpeg.makeTestClip({ out, durationSec: req.durationSec, colorHex, width: 1280, height: 720 });
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
