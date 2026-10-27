import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../core/config";
import { createAccountPool, isProfileLoggedIn } from "./accounts";
import { assertMuseAllowed, createMuseProvider, findRefusal, videoWaitMs } from "./index";
import { formatImagePrompt, formatVideoPrompt } from "./prompt";
import { validateVideoProbe } from "./validate";

describe("formatVideoPrompt", () => {
  it("giữ khuôn Story Studio: thời lượng, chế độ, hành động, 16:9", () => {
    const p = formatVideoPrompt("  một con báo đi qua suối ", 5);
    expect(p.startsWith("tạo cho tôi 1 video 5s: [Duration: 5s]")).toBe(true);
    expect(p).toContain("Action: một con báo đi qua suối,");
    expect(p).toContain("16:9 landscape");
  });
  it("từ chối prompt rỗng", () => {
    expect(() => formatVideoPrompt("  ", 5)).toThrow(/trống/);
  });
});

describe("validateVideoProbe", () => {
  const ok = { width: 1280, height: 720, durationSec: 5.04, hasAudio: true };
  it("nhận clip 5 giây 16:9", () => {
    expect(validateVideoProbe(ok, 5)).toEqual({ ok: true });
  });
  it("loại video cũ dài hơn 2×yêu cầu + 0.5 giây", () => {
    const r = validateVideoProbe({ ...ok, durationSec: 10.7 }, 5);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/video cũ/);
  });
  it("loại clip quá ngắn, quá nhỏ, dọc/vuông (avatar)", () => {
    expect(validateVideoProbe({ ...ok, durationSec: 2 }, 5).ok).toBe(false);
    expect(validateVideoProbe({ ...ok, width: 480, height: 270 }, 5).ok).toBe(false);
    expect(validateVideoProbe({ ...ok, width: 720, height: 720 }, 5).ok).toBe(false);
  });
  it("chờ lâu hơn cho clip 10 giây", () => {
    expect(videoWaitMs(10)).toBeGreaterThan(videoWaitMs(5));
  });
});

describe("chặn Muse trong test", () => {
  it("APP_ENV=test mà không có MUSE_LIVE=1 thì từ chối trước khi mở trình duyệt", async () => {
    const cfg = loadConfig({ APP_ENV: "test" });
    expect(() => assertMuseAllowed(cfg)).toThrow(/Test không được gọi Muse thật/);
    const never = () => {
      throw new Error("không được tới đây");
    };
    const provider = createMuseProvider(cfg, { acquire: never, tryAcquire: never, acquireWait: never, loggedInCount: () => 0, release: () => undefined, snapshot: () => [] });
    await expect(provider.generateVideo({ prompt: "x", durationSec: 5 }, {} as never)).rejects.toThrow(/Test không được gọi Muse thật/);
  });
  it("MUSE_LIVE=1 thì cho phép", () => {
    expect(() => assertMuseAllowed(loadConfig({ APP_ENV: "test", MUSE_LIVE: "1" }))).not.toThrow();
  });
});

describe("createAccountPool", () => {
  const root = path.join(loadConfig({}).rootDir, ".data-test", `pool-${randomUUID()}`);
  const makeProfile = (name: string, loggedIn: boolean) => {
    const dir = path.join(root, name);
    mkdirSync(loggedIn ? path.join(dir, "Default", "IndexedDB", "https_muse.ai_0.indexeddb.leveldb") : dir, { recursive: true });
    return dir;
  };
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("báo hướng dẫn đăng nhập khi chưa có hồ sơ nào đăng nhập", () => {
    makeProfile("muse_vid_01", false);
    expect(() => createAccountPool(root).acquire()).toThrow(/npm run muse:login/);
  });

  it("xoay vòng hồ sơ đã đăng nhập, bỏ qua hồ sơ bận, nghỉ sau lỗi", () => {
    expect(isProfileLoggedIn(makeProfile("muse_vid_01", true))).toBe(true);
    makeProfile("muse_vid_02", true);
    makeProfile("muse_vid_03", false);
    makeProfile("khac", true);
    let t = 0;
    const pool = createAccountPool(root, 60_000, () => t);
    const a = pool.acquire();
    const b = pool.acquire();
    expect([a.id, b.id]).toEqual(["muse_vid_01", "muse_vid_02"]);
    expect(() => pool.acquire()).toThrow(/đang bận/);
    pool.release(a.id, "cooldown");
    pool.release(b.id, "ok");
    expect(pool.acquire().id).toBe("muse_vid_02");
    t = 61_000;
    pool.release("muse_vid_02", "needs_login");
    expect(pool.acquire().id).toBe("muse_vid_01");
    expect(pool.snapshot().map((s) => s.id)).toEqual(["muse_vid_01", "muse_vid_02", "muse_vid_03"]);
  });
});

describe("prompt ảnh và nhận biết từ chối", () => {
  it("chú thích vai trò từng ảnh đính kèm theo thứ tự", () => {
    const p = formatImagePrompt("she splits a log", ["character", "character", "location"]);
    expect(p).toContain("ảnh 1: hồ sơ nhân vật");
    expect(p).toContain("ảnh 3: hồ sơ bối cảnh");
    expect(p).toContain("she splits a log");
    expect(formatVideoPrompt("x", 5, true)).toContain("[Mode: Image-to-Video]");
  });

  it("findRefusal bắt câu từ chối tiếng Việt/Anh, bỏ qua câu bình thường", () => {
    expect(findRefusal("Xin lỗi, mình không thể tạo hình ảnh này vì vi phạm nguyên tắc.")).toMatch(/không thể tạo/);
    expect(findRefusal("Sorry, I can't create that image.")).toMatch(/can't create/);
    expect(findRefusal("Ok, mình làm thêm một bản mới nữa nhé — bản này xong mình gửi bạn ngay.")).toBeNull();
  });
});

describe("chờ tài khoản rảnh", () => {
  const root = path.join(loadConfig({}).rootDir, ".data-test", `pool-wait-${randomUUID()}`);
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  it("acquireWait đợi đến khi tài khoản duy nhất được trả lại", async () => {
    mkdirSync(path.join(root, "muse_vid_01", "Default", "IndexedDB", "https_muse.ai_0.indexeddb.leveldb"), { recursive: true });
    const pool = createAccountPool(root, 0);
    expect(pool.loggedInCount()).toBe(1);
    const a = pool.acquire();
    let waited = 0;
    setTimeout(() => pool.release(a.id, "ok"), 300);
    const b = await pool.acquireWait(new AbortController().signal, () => waited++);
    expect(b.id).toBe("muse_vid_01");
    expect(waited).toBeGreaterThan(0);
  });
});
