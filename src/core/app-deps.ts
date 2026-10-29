import type { AccountPool } from "../providers/muse/accounts";
import type { ProviderRegistry } from "../providers/types";
import type { AppConfig } from "./config";
import type { Db } from "./db/client";
import type { Ffmpeg } from "./ffmpeg";
import type { ServerNode } from "./node-runtime";
import type { Queue } from "./queue";
import type { ChatLocks } from "./run-shared";
import type { Storage } from "./storage";

export type AppDeps = {
  cfg: AppConfig;
  db: Db;
  storage: Storage;
  ffmpeg: Ffmpeg;
  providers: ProviderRegistry;
  nodes: Record<string, ServerNode>;
  queue: Queue;
  musePool: AccountPool;
  chatLocks: ChatLocks;
};
