import { spawn } from "node:child_process";
import { z } from "zod";

export type VideoProbe = { width: number; height: number; durationSec: number; hasAudio: boolean };

export type Ffmpeg = {
  probeVideo(filePath: string): Promise<VideoProbe>;
  makeTestClip(opts: { out: string; durationSec: number; colorHex: string; width: number; height: number }): Promise<void>;
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
  format: z.object({ duration: z.coerce.number() }),
});

export function createFfmpeg(paths: { ffmpegPath: string; ffprobePath: string }): Ffmpeg {
  return {
    async probeVideo(filePath) {
      const { stdout } = await run(
        paths.ffprobePath,
        ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", filePath],
        30_000,
      );
      const parsed = ProbeSchema.safeParse(JSON.parse(stdout));
      if (!parsed.success) throw new Error(`ffprobe trả dữ liệu không đọc được cho ${filePath}`);
      const video = parsed.data.streams.find((s) => s.codec_type === "video");
      if (!video?.width || !video.height) throw new Error(`File không có luồng hình: ${filePath}`);
      return {
        width: video.width,
        height: video.height,
        durationSec: parsed.data.format.duration,
        hasAudio: parsed.data.streams.some((s) => s.codec_type === "audio"),
      };
    },

    async makeTestClip({ out, durationSec, colorHex, width, height }) {
      if (!/^[0-9a-fA-F]{6}$/.test(colorHex)) throw new Error(`Màu không hợp lệ: ${colorHex}`);
      await run(
        paths.ffmpegPath,
        [
          "-y", "-v", "error",
          "-f", "lavfi", "-i", `color=c=0x${colorHex}:s=${width}x${height}:r=24:d=${durationSec}`,
          "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=44100:duration=${durationSec}`,
          "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "2", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-movflags", "+faststart",
          out,
        ],
        120_000,
      );
    },
  };
}
