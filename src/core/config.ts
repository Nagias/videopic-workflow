import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));

const EnvSchema = z.object({
  APP_ENV: z.enum(["dev", "test"]).default("dev"),
  DATA_DIR: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  MUSE_LIVE: z.enum(["0", "1"]).default("0"),
  MUSE_HEADLESS: z.enum(["0", "1"]).default("1"),
  MUSE_URL: z.url().default("https://muse.ai"),
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  FFPROBE_PATH: z.string().min(1).default("ffprobe"),
  SERVE_WEB: z.enum(["0", "1"]).default("0"),
});

export type AppConfig = {
  rootDir: string;
  dataDir: string;
  dbPath: string;
  mediaDir: string;
  tmpDir: string;
  profilesDir: string;
  webDistDir: string;
  port: number;
  appEnv: "dev" | "test";
  museLive: boolean;
  museHeadless: boolean;
  museUrl: string;
  ffmpegPath: string;
  ffprobePath: string;
  serveWeb: boolean;
};

export function loadConfig(env: Record<string, string | undefined> = process.env, overrides: Partial<AppConfig> = {}): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Cấu hình môi trường sai: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  const e = parsed.data;
  const dataDir = path.resolve(e.DATA_DIR ?? path.join(ROOT_DIR, ".data"));
  return {
    rootDir: ROOT_DIR,
    dataDir,
    dbPath: path.join(dataDir, "app.db"),
    mediaDir: path.join(dataDir, "media"),
    tmpDir: path.join(dataDir, "tmp"),
    profilesDir: path.join(dataDir, "chrome_profiles"),
    webDistDir: path.join(ROOT_DIR, "dist"),
    port: e.PORT,
    appEnv: e.APP_ENV,
    museLive: e.MUSE_LIVE === "1",
    museHeadless: e.MUSE_HEADLESS === "1",
    museUrl: e.MUSE_URL,
    ffmpegPath: e.FFMPEG_PATH,
    ffprobePath: e.FFPROBE_PATH,
    serveWeb: e.SERVE_WEB === "1",
    ...overrides,
  };
}
