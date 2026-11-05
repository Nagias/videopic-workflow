import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { media } from "../src/core/db/schema";
import { ToolUnavailableError } from "../src/core/ffmpeg";
import { UploadResponseSchema } from "../src/shared/api";
import { createTestServer, type TestServer } from "./helpers/server";

describe("tải ảnh thật lên (POST /api/media/upload)", () => {
  let s: TestServer;
  beforeEach(async () => {
    s = await createTestServer();
  });
  afterEach(async () => {
    await s.cleanup();
  });

  const image = async (ext: "jpg" | "png", colorHex = "3a7d44", width = 640, height = 480): Promise<Buffer> => {
    const out = path.join(s.cfg.tmpDir, `thu-${colorHex}-${width}.${ext}`);
    await s.storage.tmpPath(ext); // tạo thư mục tạm
    await s.ffmpeg.makeTestImage({ out, colorHex, width, height });
    return readFile(out);
  };
  const upload = (body: Buffer, contentType: string, headers: Record<string, string> = {}) =>
    s.app.inject({ method: "POST", url: "/api/media/upload", headers: { "content-type": contentType, ...headers }, payload: body });
  const mediaCount = () => s.db.select().from(media).all().length;
  const tmpCount = async () => (await readdir(s.cfg.tmpDir).catch(() => [])).length;

  it("tải jpg hợp lệ → 200, có mediaId và kích thước thật; xem lại được", async () => {
    const res = await upload(await image("jpg"), "image/jpeg");
    expect(res.statusCode).toBe(200);
    const body = UploadResponseSchema.parse(res.json());
    expect(body).toMatchObject({ width: 640, height: 480 });
    const get = await s.app.inject({ method: "GET", url: `/api/media/${body.mediaId}` });
    expect(get.statusCode).toBe(200);
    expect(get.headers["content-type"]).toBe("image/jpeg");
    expect(s.storage.getMedia(body.mediaId)?.source).toBe("upload");
  });

  it("tải cùng ảnh hai lần → cùng mediaId, không nhân đôi file", async () => {
    const bytes = await image("jpg");
    const a = UploadResponseSchema.parse((await upload(bytes, "image/jpeg")).json());
    const before = mediaCount();
    const b = UploadResponseSchema.parse((await upload(bytes, "image/jpeg")).json());
    expect(b.mediaId).toBe(a.mediaId);
    expect(mediaCount()).toBe(before);
  });

  it("png giữ nguyên định dạng, khung gốc không bị cắt; GET trả image/png", async () => {
    const res = await upload(await image("png", "aa5500", 500, 900), "image/png");
    expect(res.statusCode).toBe(200);
    const body = UploadResponseSchema.parse(res.json());
    expect(body).toMatchObject({ width: 500, height: 900 });
    expect(s.storage.getMedia(body.mediaId)?.relPath.endsWith(".png")).toBe(true);
    const get = await s.app.inject({ method: "GET", url: `/api/media/${body.mediaId}` });
    expect(get.headers["content-type"]).toBe("image/png");
  });

  it("Content-Type image/jpeg nhưng thân là chữ → 400 tiếng Việt, không thêm bản ghi media", async () => {
    const before = mediaCount();
    const res = await upload(Buffer.from("day khong phai la anh"), "image/jpeg");
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toBe("Không đọc được ảnh, file có thể bị hỏng");
    expect(mediaCount()).toBe(before);
  });

  it("đầu file không đúng loại đã khai (jpg khai là png, danh sách HLS khai là jpg) → 400, không đưa cho ffmpeg, không thêm media", async () => {
    const before = mediaCount();
    const asPng = await upload(await image("jpg"), "image/png");
    expect(asPng.statusCode).toBe(400);
    const playlist = ["#EXTM3U", "#EXT-X-TARGETDURATION:1", "#EXTINF:1,", "file:///C:/Windows/win.ini", "#EXT-X-ENDLIST", ""].join("\n");
    const hls = await upload(Buffer.from(playlist), "image/jpeg");
    expect(hls.statusCode).toBe(400);
    expect(hls.json<{ error: string }>().error).toBe("Không đọc được ảnh, file có thể bị hỏng");
    expect(mediaCount()).toBe(before);
  });

  it("máy thiếu ffprobe → 500 nói rõ cần cài ffmpeg (không báo nhầm thành ảnh hỏng), không để lại file tạm", async () => {
    const bytes = await image("jpg");
    const before = await tmpCount();
    s.deps.ffmpeg = { ...s.deps.ffmpeg, probeImage: () => Promise.reject(new ToolUnavailableError("Không chạy được ffprobe (spawn ENOENT). Cài ffmpeg và thêm vào PATH")) };
    const res = await upload(bytes, "image/jpeg");
    expect(res.statusCode).toBe(500);
    expect(res.json<{ error: string }>().error).toContain("Không chạy được ffprobe");
    expect(await tmpCount()).toBe(before);
  });

  it("lưu ảnh lỗi (đĩa/db) → lỗi nổi lên, không để lại file tạm", async () => {
    const bytes = await image("jpg", "777777");
    const before = await tmpCount();
    s.deps.storage = { ...s.deps.storage, importFile: () => Promise.reject(new Error("đĩa đầy")) };
    const res = await upload(bytes, "image/jpeg");
    expect(res.statusCode).toBe(500);
    expect(await tmpCount()).toBe(before);
  });

  it("ảnh HEIC → 415 với lời dặn lưu lại thành JPG", async () => {
    const res = await upload(Buffer.from("heic"), "image/heic");
    expect(res.statusCode).toBe(415);
    expect(res.json<{ error: string }>().error).toBe("Ảnh HEIC chưa đọc được, hãy lưu lại thành JPG");
  });

  it("loại ảnh khác (gif) → 415 tiếng Việt", async () => {
    const res = await upload(Buffer.from("GIF89a"), "image/gif");
    expect(res.statusCode).toBe(415);
    expect(res.json<{ error: string }>().error).toBe("Chỉ nhận ảnh JPG, PNG hoặc WebP");
  });

  it("text/plain gửi vào đường tải ảnh → 403 (lớp chặn), không thêm bản ghi media", async () => {
    const before = mediaCount();
    const res = await upload(Buffer.from("xin chao"), "text/plain");
    expect(res.statusCode).toBe(403);
    expect(mediaCount()).toBe(before);
  });

  it("lớn hơn 20 MB → 413 tiếng Việt", async () => {
    const res = await upload(Buffer.alloc(20 * 1024 * 1024 + 1), "image/jpeg");
    expect(res.statusCode).toBe(413);
    expect(res.json<{ error: string }>().error).toBe("Ảnh lớn hơn 20 MB");
  });
});
