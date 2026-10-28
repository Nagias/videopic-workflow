import { createHash } from "node:crypto";
import type { MediaProvider } from "../types";
import { fakeTextReply } from "./text";

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
      const session = req.session === "new" ? { accountId: "fake", threadUrl: `fake://thread/${key.length}-${rec.id.slice(0, 8)}` } : req.session;
      return { mediaId: rec.id, width: 1280, height: 720, ...(session ? { session } : {}) };
    },

    generateText(req, ctx) {
      ctx.report("Đang viết chữ giả…");
      const session = req.session ?? { accountId: "fake", threadUrl: `fake://thread/text-${createHash("sha256").update(req.prompt).digest("hex").slice(0, 8)}` };
      return Promise.resolve({ text: fakeTextReply(req.prompt), session });
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
