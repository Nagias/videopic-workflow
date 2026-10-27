import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { loadConfig, type AppConfig } from "../../src/core/config";
import { openDb, type Db } from "../../src/core/db/client";
import { createFfmpeg, type Ffmpeg } from "../../src/core/ffmpeg";
import { createStorage, type Storage } from "../../src/core/storage";

export type TestEnv = { cfg: AppConfig; db: Db; storage: Storage; ffmpeg: Ffmpeg; cleanup(): Promise<void> };

export function createTestEnv(): TestEnv {
  const base = loadConfig({ APP_ENV: "test" });
  const dataDir = path.join(base.rootDir, ".data-test", randomUUID());
  const cfg = loadConfig({ APP_ENV: "test", DATA_DIR: dataDir });
  const db = openDb(cfg.dbPath);
  const storage = createStorage(cfg, db);
  const ffmpeg = createFfmpeg(cfg);
  return {
    cfg,
    db,
    storage,
    ffmpeg,
    async cleanup() {
      db.$client.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
