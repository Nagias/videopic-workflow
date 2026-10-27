import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadConfig } from "./config";
import { createTestEnv, type TestEnv } from "../../tests/helpers/test-env";

describe("loadConfig", () => {
  it("mặc định dữ liệu nằm trong .data của dự án, cổng 8787", () => {
    const cfg = loadConfig({});
    expect(cfg.dataDir.replace(/\\/g, "/")).toMatch(/\/\.data$/);
    expect(cfg.port).toBe(8787);
    expect(cfg.museLive).toBe(false);
  });

  it("báo lỗi tiếng Việt khi biến môi trường sai", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/Cấu hình môi trường sai/);
  });
});

describe("ffmpeg + storage", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it("makeTestClip tạo clip 5 giây 1280x720 có tiếng, probeVideo đọc đúng", async () => {
    const out = await env.storage.tmpPath("mp4");
    await env.ffmpeg.makeTestClip({ out, durationSec: 5, colorHex: "336699", width: 1280, height: 720 });
    const probe = await env.ffmpeg.probeVideo(out);
    expect(probe.width).toBe(1280);
    expect(probe.height).toBe(720);
    expect(probe.durationSec).toBeGreaterThan(4.8);
    expect(probe.durationSec).toBeLessThan(5.3);
    expect(probe.hasAudio).toBe(true);
  });

  it("importFile hai lần cùng nội dung trả cùng bản ghi, file tạm được dọn", async () => {
    const a = await env.storage.writeTemp(new TextEncoder().encode("cùng-nội-dung"), "mp4");
    const b = await env.storage.writeTemp(new TextEncoder().encode("cùng-nội-dung"), "mp4");
    const r1 = await env.storage.importFile(a, { kind: "video", source: "test" });
    const r2 = await env.storage.importFile(b, { kind: "video", source: "test" });
    expect(r2.id).toBe(r1.id);
    expect(env.storage.hasSha256(r1.sha256)).toBe(true);
    expect(existsSync(env.storage.absPath(r1))).toBe(true);
    expect(existsSync(b)).toBe(false);
  });

  it("removeTemp từ chối xoá file ngoài thư mục tạm", async () => {
    await expect(env.storage.removeTemp(env.cfg.dbPath)).rejects.toThrow(/Chỉ được xoá file tạm/);
  });
});
