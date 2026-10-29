import type { FastifyInstance } from "fastify";
import { buildServer } from "../../src/app-server";
import type { AppDeps } from "../../src/core/app-deps";
import { createQueue } from "../../src/core/queue";
import { createChatLocks } from "../../src/core/run-shared";
import { createAccountPool } from "../../src/providers/muse/accounts";
import { countingFakeProviders, testNodes } from "./nodes";
import { createTestEnv, type TestEnv } from "./test-env";

export type TestServer = TestEnv & { app: FastifyInstance; deps: AppDeps; calls: () => number; imageCalls: () => number };

export async function createTestServer(): Promise<TestServer> {
  const env = createTestEnv();
  const { providers, calls, log } = countingFakeProviders();
  const base = { db: env.db, storage: env.storage, ffmpeg: env.ffmpeg, providers, nodes: testNodes, chatLocks: createChatLocks() };
  const deps: AppDeps = { ...base, cfg: env.cfg, queue: createQueue(base), musePool: createAccountPool(env.cfg.profilesDir) };
  const app = await buildServer(deps);
  return {
    ...env,
    app,
    deps,
    calls,
    imageCalls: () => log.image,
    async cleanup() {
      await deps.queue.stop();
      await app.close();
      await env.cleanup();
    },
  };
}
