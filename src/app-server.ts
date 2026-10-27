import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { AppDeps } from "./core/app-deps";
import { registerMediaRoutes } from "./features/media/routes";
import { registerMuseAccountRoutes } from "./features/muse-accounts/routes";
import { registerRunRoutes } from "./features/runs/routes";
import { registerWorkflowRoutes } from "./features/workflows/routes";

export async function buildServer(deps: AppDeps, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024 });

  await app.register(fastifyStatic, { root: deps.cfg.mediaDir, serve: false });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? `Lỗi máy chủ: ${err.message}` : err.message });
  });

  registerWorkflowRoutes(app, deps);
  registerRunRoutes(app, deps);
  registerMediaRoutes(app, deps);
  registerMuseAccountRoutes(app, deps);

  if (deps.cfg.serveWeb) {
    if (!existsSync(deps.cfg.webDistDir)) throw new Error(`Chưa build giao diện (${deps.cfg.webDistDir}). Chạy npm run build.`);
    await app.register(fastifyStatic, { root: deps.cfg.webDistDir, prefix: "/", decorateReply: false });
  }
  return app;
}
