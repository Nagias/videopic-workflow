import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../core/app-deps";

const CONTENT_TYPE: Record<string, string> = { video: "video/mp4", image: "image/jpeg" };

export function registerMediaRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get<{ Params: { id: string } }>("/api/media/:id", async (req, reply) => {
    const rec = deps.storage.getMedia(req.params.id);
    if (!rec) return reply.code(404).send({ error: "Không tìm thấy file" });
    reply.header("Content-Type", CONTENT_TYPE[rec.kind] ?? "application/octet-stream");
    return reply.sendFile(rec.relPath, deps.cfg.mediaDir);
  });
}
