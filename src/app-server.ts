import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { AppDeps } from "./core/app-deps";
import { registerAssetRoutes } from "./features/assets/routes";
import { registerMediaRoutes } from "./features/media/routes";
import { registerMuseAccountRoutes } from "./features/muse-accounts/routes";
import { registerRunRoutes } from "./features/runs/routes";
import { registerWorkflowRoutes } from "./features/workflows/routes";

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;

export function localRequestProblem(method: string, headers: Record<string, string | string[] | undefined>): string | null {
  const host = typeof headers.host === "string" ? headers.host : "";
  if (!LOCAL_HOST_RE.test(host)) return "Chỉ nhận yêu cầu tới localhost";
  if (method === "GET" || method === "HEAD") return null;
  const origin = typeof headers.origin === "string" ? headers.origin : undefined;
  if (origin !== undefined) {
    const originHost = URL.canParse(origin) ? new URL(origin).host : null;
    if (originHost === null) return "Origin không hợp lệ";
    if (!LOCAL_HOST_RE.test(originHost)) return "Từ chối yêu cầu từ trang web khác";
  }
  const ctype = typeof headers["content-type"] === "string" ? headers["content-type"] : "";
  if (!ctype.toLowerCase().startsWith("application/json")) return "Yêu cầu ghi phải gửi dạng JSON";
  return null;
}

export async function buildServer(deps: AppDeps, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024 });

  await app.register(fastifyStatic, { root: deps.cfg.mediaDir, serve: false });

  app.addHook("onRequest", async (req, reply) => {
    const problem = localRequestProblem(req.method, req.headers);
    if (problem) return reply.code(403).send({ error: problem });
  });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? `Lỗi máy chủ: ${err.message}` : err.message });
  });

  registerWorkflowRoutes(app, deps);
  registerRunRoutes(app, deps);
  registerMediaRoutes(app, deps);
  registerMuseAccountRoutes(app, deps);
  registerAssetRoutes(app, deps);

  if (deps.cfg.serveWeb) {
    if (!existsSync(deps.cfg.webDistDir)) throw new Error(`Chưa build giao diện (${deps.cfg.webDistDir}). Chạy npm run build.`);
    await app.register(fastifyStatic, { root: deps.cfg.webDistDir, prefix: "/", decorateReply: false });
  }
  return app;
}
