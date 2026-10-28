import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "../../tests/helpers/test-env";
import { brightnessExpr } from "./ffmpeg";

describe("ffmpeg cho chuỗi cảnh", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it("ảnh → clip 5 giây, rút khung cuối, chuẩn hoá ảnh dọc về 1280x720", async () => {
    const img = await env.storage.tmpPath("jpg");
    await env.ffmpeg.makeTestImage({ out: img, colorHex: "808080", width: 720, height: 1280 });
    const norm = await env.storage.tmpPath("jpg");
    await env.ffmpeg.normalizeImage(img, norm);
    expect(await env.ffmpeg.probeImage(norm)).toEqual({ width: 1280, height: 720 });

    const clip = await env.storage.tmpPath("mp4");
    await env.ffmpeg.imageToClip({ image: norm, out: clip, durationSec: 5 });
    const p = await env.ffmpeg.probeVideo(clip);
    expect(Math.round(p.durationSec)).toBe(5);

    const last = await env.storage.tmpPath("jpg");
    await env.ffmpeg.extractFrame(clip, last, { fromEndSec: 0.15 });
    expect(await env.ffmpeg.probeImage(last)).toEqual({ width: 1280, height: 720 });
  });

  it("bù sáng ngay trong bước ghép: clip tối dần được kéo sáng lại gần đầu clip, chỉ một lần nén", async () => {
    const img = await env.storage.tmpPath("jpg");
    await env.ffmpeg.makeTestImage({ out: img, colorHex: "b0b0b0", width: 1280, height: 720 });
    const clip = await env.storage.tmpPath("mp4");
    await env.ffmpeg.imageToClip({ image: img, out: clip, durationSec: 5 });
    const start = await env.ffmpeg.measureLuma(clip, 0.1);
    const end = await env.ffmpeg.measureLuma(clip, 4.9);
    expect(end).toBeLessThan(start - 10);

    const film = await env.storage.tmpPath("mp4");
    await env.ffmpeg.concatClips(
      [
        { path: clip, trimStartSec: 0, durationSec: 5, hasAudio: true, brightness: { startLuma: start, endLuma: end, clipSec: 5 } },
        { path: clip, trimStartSec: 0, durationSec: 5, hasAudio: true },
      ],
      film,
    );
    const fixedEnd = await env.ffmpeg.measureLuma(film, 4.85);
    expect(Math.abs(fixedEnd - start)).toBeLessThan(6);
    const plainEnd = await env.ffmpeg.measureLuma(film, 9.85);
    expect(plainEnd).toBeLessThan(start - 10);
  });

  it("brightnessExpr bỏ qua chênh lệch nhỏ", () => {
    expect(brightnessExpr(120, 118, 5)).toBeNull();
    expect(brightnessExpr(120, 60, 5)).toContain("brightness='0.2353*min(t/5.000,1)'");
  });

  it("ghép clip: cắt clip 10 giây về 5 giây, bỏ khung đầu ở mối nối, clip không tiếng vẫn ghép được", async () => {
    const a = await env.storage.tmpPath("mp4");
    const b = await env.storage.tmpPath("mp4");
    await env.ffmpeg.makeTestClip({ out: a, durationSec: 10, colorHex: "aa0000", width: 1280, height: 720 });
    const img = await env.storage.tmpPath("jpg");
    await env.ffmpeg.makeTestImage({ out: img, colorHex: "00aa00", width: 1248, height: 704 });
    await env.ffmpeg.imageToClip({ image: img, out: b, durationSec: 5 });
    const out = await env.storage.tmpPath("mp4");
    await env.ffmpeg.concatClips(
      [
        { path: a, trimStartSec: 0, durationSec: 5, hasAudio: true },
        { path: b, trimStartSec: 0.083, durationSec: 4.9, hasAudio: false },
      ],
      out,
    );
    const p = await env.ffmpeg.probeVideo(out);
    expect(p.width).toBe(1280);
    expect(p.height).toBe(720);
    expect(p.hasAudio).toBe(true);
    expect(p.durationSec).toBeGreaterThan(9.7);
    expect(p.durationSec).toBeLessThan(10.2);
  });
});
