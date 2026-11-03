import path from "node:path";
import type { FastifyError, FastifyInstance } from "fastify";
import type { AppDeps } from "../../core/app-deps";
import type { UploadResponse } from "../../shared/api";

const CONTENT_TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4" };
const FALLBACK_TYPE: Record<string, string> = { video: "video/mp4", image: "image/jpeg" };

// Ảnh tải lên: giữ nguyên định dạng gốc (không đổi, không cắt khung).
const UPLOAD_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export function registerMediaRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get<{ Params: { id: string } }>("/api/media/:id", async (req, reply) => {
    const rec = deps.storage.getMedia(req.params.id);
    if (!rec) return reply.code(404).send({ error: "Không tìm thấy file" });
    const ext = path.extname(rec.relPath).slice(1).toLowerCase();
    reply.header("Content-Type", CONTENT_TYPE_BY_EXT[ext] ?? FALLBACK_TYPE[rec.kind] ?? "application/octet-stream");
    return reply.sendFile(rec.relPath, deps.cfg.mediaDir);
  });

  // Mọi image/* đọc thành byte; loại nào nhận được do route quyết định (để lời báo là tiếng Việt).
  app.addContentTypeParser(/^image\//, { parseAs: "buffer", bodyLimit: UPLOAD_MAX_BYTES }, (_req, body, done) => done(null, body));

  app.post("/api/media/upload", {
    bodyLimit: UPLOAD_MAX_BYTES,
    // Lỗi quá cỡ của Fastify là tiếng Anh: đổi sang lời tiếng Việt. Lỗi khác để bộ xử lý chung của app lo.
    errorHandler: (err: FastifyError, _req, reply) => {
      if (err.code !== "FST_ERR_CTP_BODY_TOO_LARGE") throw err;
      void reply.code(413).send({ error: "Ảnh lớn hơn 20 MB" });
    },
    handler: async (req, reply) => {
      const type = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      if (type === "image/heic" || type === "image/heif") return reply.code(415).send({ error: "Ảnh HEIC chưa đọc được, hãy lưu lại thành JPG" });
      const ext = UPLOAD_EXT[type];
      if (!ext || !Buffer.isBuffer(req.body)) return reply.code(415).send({ error: "Chỉ nhận ảnh JPG, PNG hoặc WebP" });
      if (req.body.length === 0) return reply.code(400).send({ error: "File ảnh trống" });

      const tmp = await deps.storage.writeTemp(req.body, ext);
      let size: { width: number; height: number };
      try {
        size = await deps.ffmpeg.probeImage(tmp);
      } catch (err) {
        await deps.storage.removeTemp(tmp);
        req.log.warn({ err }, "ảnh tải lên không đọc được");
        return reply.code(400).send({ error: "Không đọc được ảnh, file có thể bị hỏng" });
      }
      const rec = await deps.storage.importFile(tmp, { kind: "image", source: "upload", ...size });
      const body: UploadResponse = { mediaId: rec.id, width: rec.width ?? size.width, height: rec.height ?? size.height };
      return body;
    },
  });
}
