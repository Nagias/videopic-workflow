import { spawn } from "node:child_process";
import { z } from "zod";

export type VideoProbe = { width: number; height: number; durationSec: number; hasAudio: boolean };
export type ImageProbe = { width: number; height: number };

// brightness: Muse hay làm cuối clip tối dần — kéo sáng lại ngay trong lần nén duy nhất lúc ghép.
export type ConcatPart = {
  path: string;
  trimStartSec: number;
  durationSec: number;
  hasAudio: boolean;
  brightness?: { startLuma: number; endLuma: number; clipSec: number };
};

export const FRAME_W = 1280;
export const FRAME_H = 720;
export const FPS = 24;

export type Ffmpeg = {
  probeVideo(filePath: string): Promise<VideoProbe>;
  probeImage(filePath: string): Promise<ImageProbe>;
  makeTestClip(opts: { out: string; durationSec: number; colorHex: string; width: number; height: number }): Promise<void>;
  makeTestImage(opts: { out: string; colorHex: string; width: number; height: number }): Promise<void>;
  imageToClip(opts: { image: string; out: string; durationSec: number }): Promise<void>;
  normalizeImage(input: string, out: string): Promise<void>;
  extractFrame(video: string, out: string, opts: { fromEndSec: number }): Promise<void>;
  measureLuma(video: string, atSec: number): Promise<number>;
  concatClips(parts: ConcatPart[], out: string): Promise<void>;
};

type RunResult = { stdout: string; stderr: string };

function run(bin: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${bin} chạy quá ${Math.round(timeoutMs / 1000)} giây, đã dừng`));
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Không chạy được ${bin} (${err.message}). Cài ffmpeg và thêm vào PATH, hoặc đặt FFMPEG_PATH/FFPROBE_PATH.`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} lỗi (mã ${code}): ${stderr.trim().split("\n").slice(-3).join(" | ")}`));
    });
  });
}

const ProbeSchema = z.object({
  streams: z.array(z.object({ codec_type: z.string(), width: z.number().optional(), height: z.number().optional() })),
  format: z.object({ duration: z.coerce.number().optional() }),
});

const ENCODE_V = ["-c:v", "libx264", "-preset", "medium", "-crf", "17", "-threads", "2", "-pix_fmt", "yuv420p", "-r", String(FPS)];
const ENCODE_A = ["-c:a", "aac", "-ar", "44100", "-ac", "2"];

function checkHex(hex: string) {
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Màu không hợp lệ: ${hex}`);
}

export function brightnessExpr(startLuma: number, endLuma: number, durationSec: number): string | null {
  const diff = startLuma - endLuma;
  if (Math.abs(diff) < 4 || durationSec <= 0) return null;
  const k = (diff / 255).toFixed(4);
  return `eq=eval=frame:brightness='${k}*min(t/${durationSec.toFixed(3)},1)'`;
}

export function createFfmpeg(paths: { ffmpegPath: string; ffprobePath: string }): Ffmpeg {
  const ff = (args: string[], timeoutMs = 180_000) => run(paths.ffmpegPath, ["-y", "-v", "error", ...args], timeoutMs);

  const probe = async (filePath: string) => {
    const { stdout } = await run(
      paths.ffprobePath,
      ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", filePath],
      30_000,
    );
    const parsed = ProbeSchema.safeParse(JSON.parse(stdout));
    if (!parsed.success) throw new Error(`ffprobe trả dữ liệu không đọc được cho ${filePath}`);
    return parsed.data;
  };

  return {
    async probeVideo(filePath) {
      const data = await probe(filePath);
      const video = data.streams.find((s) => s.codec_type === "video");
      if (!video?.width || !video.height) throw new Error(`File không có luồng hình: ${filePath}`);
      return {
        width: video.width,
        height: video.height,
        durationSec: data.format.duration ?? 0,
        hasAudio: data.streams.some((s) => s.codec_type === "audio"),
      };
    },

    async probeImage(filePath) {
      const data = await probe(filePath);
      const v = data.streams.find((s) => s.codec_type === "video");
      if (!v?.width || !v.height) throw new Error(`Không đọc được ảnh: ${filePath}`);
      return { width: v.width, height: v.height };
    },

    async makeTestClip({ out, durationSec, colorHex, width, height }) {
      checkHex(colorHex);
      await ff([
        "-f", "lavfi", "-i", `color=c=0x${colorHex}:s=${width}x${height}:r=${FPS}:d=${durationSec}`,
        "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=44100:duration=${durationSec}`,
        "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "2", "-pix_fmt", "yuv420p",
        ...ENCODE_A, "-movflags", "+faststart", out,
      ]);
    },

    async makeTestImage({ out, colorHex, width, height }) {
      checkHex(colorHex);
      await ff(["-f", "lavfi", "-i", `color=c=0x${colorHex}:s=${width}x${height}`, "-frames:v", "1", "-q:v", "3", out]);
    },

    async imageToClip({ image, out, durationSec }) {
      await ff([
        "-loop", "1", "-t", String(durationSec), "-i", image,
        "-f", "lavfi", "-i", `sine=frequency=330:sample_rate=44100:duration=${durationSec}`,
        "-vf", `scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=increase,crop=${FRAME_W}:${FRAME_H},fade=t=out:st=${durationSec - 1}:d=1:c=black@0.3`,
        "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "2", "-pix_fmt", "yuv420p", "-r", String(FPS),
        ...ENCODE_A, "-movflags", "+faststart", out,
      ]);
    },

    async normalizeImage(input, out) {
      await ff(["-i", input, "-vf", `scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=increase,crop=${FRAME_W}:${FRAME_H}`, "-frames:v", "1", "-q:v", "2", out]);
    },

    async extractFrame(video, out, { fromEndSec }) {
      await ff(["-sseof", `-${fromEndSec.toFixed(3)}`, "-i", video, "-frames:v", "1", "-q:v", "2", out]);
    },

    async measureLuma(video, atSec) {
      const { stderr } = await run(
        paths.ffmpegPath,
        ["-v", "info", "-ss", atSec.toFixed(3), "-i", video, "-frames:v", "1", "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"],
        60_000,
      );
      const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(stderr);
      if (!m?.[1]) throw new Error(`Không đo được độ sáng của ${video} tại ${atSec}s`);
      return Number(m[1]);
    },

    async concatClips(parts, out) {
      if (parts.length === 0) throw new Error("Không có clip nào để ghép");
      const inputs: string[] = [];
      const filters: string[] = [];
      const labels: string[] = [];
      parts.forEach((p, i) => {
        inputs.push("-i", p.path);
        const d = p.durationSec.toFixed(3);
        const eq = p.brightness ? brightnessExpr(p.brightness.startLuma, p.brightness.endLuma, p.brightness.clipSec) : null;
        filters.push(
          `[${i}:v]trim=start=${p.trimStartSec.toFixed(3)}:duration=${d},setpts=PTS-STARTPTS,` +
            (eq ? `${eq},` : "") +
            `scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=decrease,pad=${FRAME_W}:${FRAME_H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},format=yuv420p[v${i}]`,
        );
        const fadeOut = Math.max(0, p.durationSec - 0.08).toFixed(3);
        const audioSrc = p.hasAudio
          ? `[${i}:a]atrim=start=${p.trimStartSec.toFixed(3)}:duration=${d},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo`
          : `anullsrc=r=44100:cl=stereo,atrim=duration=${d}`;
        filters.push(`${audioSrc},afade=t=in:d=0.05,afade=t=out:st=${fadeOut}:d=0.08[a${i}]`);
        labels.push(`[v${i}][a${i}]`);
      });
      filters.push(`${labels.join("")}concat=n=${parts.length}:v=1:a=1[v][a]`);
      await ff([...inputs, "-filter_complex", filters.join(";"), "-map", "[v]", "-map", "[a]", ...ENCODE_V, ...ENCODE_A, "-movflags", "+faststart", out], 900_000);
    },
  };
}
