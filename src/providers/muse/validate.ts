import type { VideoProbe } from "../../core/ffmpeg";

export const MIN_VIDEO_SECONDS = 3;
export const MIN_VIDEO_SIDE = 360;

export function maxVideoSeconds(requested: number): number {
  return requested * 2 + 0.5;
}

export function validateVideoProbe(probe: VideoProbe, requestedSec: number): { ok: true } | { ok: false; reason: string } {
  const { width: w, height: h, durationSec: d } = probe;
  if (d < MIN_VIDEO_SECONDS) return { ok: false, reason: `video quá ngắn ${d.toFixed(1)}s` };
  if (d > maxVideoSeconds(requestedSec)) {
    return { ok: false, reason: `video dài ${d.toFixed(1)}s, quá ${maxVideoSeconds(requestedSec)}s so với yêu cầu (có thể là video cũ trong đoạn chat)` };
  }
  if (Math.min(w, h) < MIN_VIDEO_SIDE) return { ok: false, reason: `độ phân giải quá thấp ${w}x${h}` };
  if (w <= h * 1.1) return { ok: false, reason: `video vuông/dọc ${w}x${h} (avatar, không phải kết quả 16:9)` };
  return { ok: true };
}
