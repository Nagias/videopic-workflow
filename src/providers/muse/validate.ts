import type { VideoProbe } from "../../core/ffmpeg";

export const MIN_VIDEO_SECONDS = 3;
export const MIN_VIDEO_SIDE = 360;

export function maxVideoSeconds(requested: number): number {
  return requested * 2 + 0.5;
}

// Dấu phần mềm nén ghi trong file ("x264 - core N"). Đo 27/10–07/11/2026: 75 clip từ công cụ tạo video AI của Muse đều
// core 157 (crf 18, tiếng 24 kHz); 38 clip Muse tự dựng bằng code trong máy của nó (cắt hình rời, vá nền, cho trượt) đều
// core 164. Danh sách cho phép: dấu lạ thì từ chối và báo rõ, không nhận nhầm clip cắt ghép.
export const MUSE_VIDEO_X264_CORES: readonly number[] = [157];
const SIGNATURE_SCAN_BYTES = 256 * 1024;

export function x264Core(bytes: Uint8Array): number | null {
  const head = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, SIGNATURE_SCAN_BYTES)).toString("latin1");
  const m = /x264 - core (\d+)/.exec(head);
  return m ? Number(m[1]) : null;
}

export function validateVideoSource(bytes: Uint8Array): { ok: true } | { ok: false; reason: string } {
  const core = x264Core(bytes);
  if (core !== null && MUSE_VIDEO_X264_CORES.includes(core)) return { ok: true };
  const seen = core === null ? "không đọc được dấu x264 trong file" : `dấu x264 core ${core}`;
  return {
    ok: false,
    reason: `video không phải từ công cụ tạo video AI của Muse (${seen}; video AI thật ghi core ${MUSE_VIDEO_X264_CORES.join("/")}) — Muse đã tự dựng clip bằng code, cắt ghép ảnh`,
  };
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
