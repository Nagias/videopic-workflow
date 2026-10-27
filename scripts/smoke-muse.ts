import { loadConfig } from "../src/core/config";
import { openDb } from "../src/core/db/client";
import { createFfmpeg } from "../src/core/ffmpeg";
import { createStorage } from "../src/core/storage";
import { createAccountPool } from "../src/providers/muse/accounts";
import { createMuseProvider } from "../src/providers/muse";

const prompt = process.argv.slice(2).join(" ").trim() || "A calm tropical rainforest at dawn, mist between giant trees, slow dolly forward";
const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const storage = createStorage(cfg, db);
const ffmpeg = createFfmpeg(cfg);
const pool = createAccountPool(cfg.profilesDir);
console.log("Hồ sơ Muse:", pool.snapshot());

const started = Date.now();
const provider = createMuseProvider(cfg, pool);
const result = await provider.generateVideo(
  { prompt, durationSec: 5 },
  { signal: new AbortController().signal, report: (m) => console.log(`  … ${m}`), storage, ffmpeg },
);
const rec = storage.getMedia(result.mediaId)!;
console.log(`OK sau ${Math.round((Date.now() - started) / 1000)} giây:`, result, "→", storage.absPath(rec));
db.$client.close();
