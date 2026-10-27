import { buildServer } from "./app-server";
import type { AppDeps } from "./core/app-deps";
import { loadConfig } from "./core/config";
import { openDb } from "./core/db/client";
import { createFfmpeg } from "./core/ffmpeg";
import { createQueue } from "./core/queue";
import { createStorage } from "./core/storage";
import { serverNodes } from "./nodes/registry.server";
import { createProviders } from "./providers";
import { createAccountPool } from "./providers/muse/accounts";

const cfg = loadConfig(undefined, process.argv.includes("--serve-web") ? { serveWeb: true } : {});
const db = openDb(cfg.dbPath);
const storage = createStorage(cfg, db);
const ffmpeg = createFfmpeg(cfg);
const musePool = createAccountPool(cfg.profilesDir);
const providers = createProviders(cfg, musePool);
const base = { db, storage, ffmpeg, providers, nodes: serverNodes };
const queue = createQueue(base, { log: (m) => console.log(`[hàng đợi] ${m}`) });
const deps: AppDeps = { ...base, cfg, queue, musePool };

const app = await buildServer(deps, { logger: false });
queue.start();
await app.listen({ host: "127.0.0.1", port: cfg.port });
console.log(`Máy chủ chạy ở http://127.0.0.1:${cfg.port} (dữ liệu: ${cfg.dataDir})`);

const shutdown = async () => {
  await queue.stop();
  await app.close();
  db.$client.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
