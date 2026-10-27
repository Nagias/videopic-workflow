import { mkdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { createMuseProvider } from "../src/providers/muse";
import { createAccountPool } from "../src/providers/muse/accounts";
import { createTestEnv, type TestEnv } from "../tests/helpers/test-env";

const patterned = (lavfi: string, out: string) =>
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", lavfi, "-frames:v", "1", out], { windowsHide: true });

const page = (withNewChat: boolean, extra: string) => `<!doctype html><html><body>
${withNewChat ? `<button data-testid="hatch-chat-switcher-trigger" onclick="document.getElementById('menu').hidden=false">Chats</button>
<div id="menu" hidden><div role="menuitem" onclick="document.getElementById('log').innerHTML=''; document.getElementById('menu').hidden=true">New side chat</div></div>` : ""}
<div role="log" id="log"><div class="message"><video src="/old.mp4" width="640" muted preload="metadata"></video></div></div>
<textarea aria-label="Message"></textarea>
<script>
const ta = document.querySelector('textarea');
ta.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  window.__prompts = (window.__prompts || []).concat(ta.value);
  ta.value = '';
  const add = (src, ms) => setTimeout(() => {
    const d = document.createElement('div'); d.className = 'message';
    d.innerHTML = '<video src="' + src + '" width="640" muted preload="metadata"></video>';
    document.getElementById('log').appendChild(d);
  }, ms);
  ${extra}
  add('/new.mp4', 1500);
});
</script></body></html>`;

const imagePage = (refuse: boolean) => `<!doctype html><html><body>
<button data-testid="hatch-chat-switcher-trigger" onclick="document.getElementById('menu').hidden=false">Chats</button>
<div id="menu" hidden><div role="menuitem" onclick="document.getElementById('log').innerHTML=''; document.getElementById('menu').hidden=true">New side chat</div></div>
<div role="log" id="log"></div>
<div><div><div><div id="composer">
  <input type="file" id="f" style="display:none" />
  <div id="previews"></div>
  <textarea aria-label="Message"></textarea>
</div></div></div></div>
<script>
const f = document.getElementById('f');
f.addEventListener('change', () => {
  const i = document.createElement('img'); i.src = '/attach-preview.png'; i.width = 64;
  document.getElementById('previews').appendChild(i);
});
const ta = document.querySelector('textarea');
ta.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const log = document.getElementById('log');
  const bubble = document.createElement('div'); bubble.className = 'message';
  bubble.innerHTML = '<p>' + ta.value.slice(0, 40) + '</p><img src="/attach-preview.png" width="600">';
  log.appendChild(bubble);
  document.getElementById('previews').innerHTML = '';
  ta.value = '';
  setTimeout(() => {
    const d = document.createElement('div'); d.className = 'message';
    d.innerHTML = ${refuse ? `'<p>Xin lỗi, mình không thể tạo hình ảnh này vì vi phạm nguyên tắc.</p>'` : `'<img src="/gen.jpg" width="640">'`};
    log.appendChild(d);
  }, 1500);
});
</script></body></html>`;

test.describe("Muse provider trên trang Muse giả (không tốn lượt thật)", () => {
  let env: TestEnv;
  let server: Server;
  let baseUrl = "";
  const clips: Record<string, string> = {};
  const images: Record<string, string> = {};
  let refMediaId = "";

  test.beforeAll(async () => {
    env = createTestEnv();
    for (const [name, color, dur] of [["old", "aa0000", 10], ["new", "00aa00", 5]] as const) {
      const out = await env.storage.tmpPath("mp4");
      await env.ffmpeg.makeTestClip({ out, durationSec: dur, colorHex: color, width: 1280, height: 720 });
      clips[name] = out;
    }
    clips["old-copy"] = clips.old!;
    const ref = await env.storage.tmpPath("jpg");
    patterned("mandelbrot=s=1280x720", ref);
    const preview = await env.storage.tmpPath("png");
    patterned("mandelbrot=s=960x540", preview);
    const gen = await env.storage.tmpPath("jpg");
    patterned("testsrc2=s=1376x768", gen);
    images["attach-preview"] = preview;
    images.gen = gen;
    refMediaId = (await env.storage.importFile(ref, { kind: "image", source: "test-ref" })).id;
    server = createServer((req, res) => {
      const url = req.url ?? "/";
      const clip = /^\/([a-z-]+)\.mp4/.exec(url)?.[1];
      if (clip && clips[clip]) {
        res.writeHead(200, { "Content-Type": "video/mp4" });
        res.end(readFileSync(clips[clip]));
        return;
      }
      const img = /^\/([a-z-]+)\.(jpg|png)/.exec(url);
      const imgFile = img?.[1] ? images[img[1]] : undefined;
      if (imgFile) {
        res.writeHead(200, { "Content-Type": img?.[2] === "png" ? "image/png" : "image/jpeg" });
        res.end(readFileSync(imgFile));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (url.startsWith("/image")) res.end(imagePage(false));
      else if (url.startsWith("/refuse")) res.end(imagePage(true));
      else if (url.startsWith("/nonewchat")) res.end(page(false, "add('/old-copy.mp4', 500);"));
      else res.end(page(true, ""));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    mkdirSync(path.join(env.cfg.profilesDir, "muse_vid_01", "Default", "IndexedDB", "https_muse.ai_0.indexeddb.leveldb"), { recursive: true });
  });

  test.afterAll(async () => {
    await new Promise((r) => server.close(r));
    await env.cleanup();
  });

  const run = async (pathname: string) => {
    const cfg = { ...env.cfg, museLive: true, museUrl: `${baseUrl}${pathname}`, museChannel: process.env.CI ? ("chromium" as const) : ("chrome" as const) };
    const provider = createMuseProvider(cfg, createAccountPool(cfg.profilesDir));
    const messages: string[] = [];
    const result = await provider.generateVideo(
      { prompt: "a jaguar walks across a jungle river", durationSec: 5 },
      { signal: new AbortController().signal, report: (m) => messages.push(m), storage: env.storage, ffmpeg: env.ffmpeg },
    );
    return { result, messages };
  };

  test("luồng bình thường: mở chat mới, gửi prompt đúng khuôn, nhận đúng clip mới 5 giây", async () => {
    const { result, messages } = await run("/");
    expect(result.durationSec).toBeGreaterThan(4.8);
    expect(result.durationSec).toBeLessThan(5.3);
    const rec = env.storage.getMedia(result.mediaId)!;
    expect(rec.source).toBe("muse:muse_vid_01");
    expect(rec.sha256).toBe(await env.storage.sha256File(clips.new!));
    expect(messages.some((m) => m.startsWith("Đã nhận video"))).toBe(true);
    expect(messages).toContain("Mở đoạn chat phụ mới");
  });

  const imageRun = async (pathname: string) => {
    const cfg = { ...env.cfg, museLive: true, museUrl: `${baseUrl}${pathname}`, museChannel: process.env.CI ? ("chromium" as const) : ("chrome" as const) };
    const provider = createMuseProvider(cfg, createAccountPool(cfg.profilesDir));
    const messages: string[] = [];
    const result = await provider.generateImage(
      { prompt: "she kneels by the campfire", references: [{ mediaId: refMediaId, role: "character" }] },
      { signal: new AbortController().signal, report: (m) => messages.push(m), storage: env.storage, ffmpeg: env.ffmpeg },
    );
    return { result, messages };
  };

  test("tạo ảnh có đính kèm: không nhận nhầm ảnh mình gửi (khác byte), nhận ảnh mới, chuẩn hoá 1280x720", async () => {
    const { result, messages } = await imageRun("/image");
    expect(result).toMatchObject({ width: 1280, height: 720 });
    const rec = env.storage.getMedia(result.mediaId)!;
    expect(rec.kind).toBe("image");
    expect(await env.ffmpeg.probeImage(env.storage.absPath(rec))).toEqual({ width: 1280, height: 720 });
    expect(messages).toContain("Đính kèm ảnh 1/1…");
    expect(messages.some((m) => m.startsWith("Đã nhận ảnh"))).toBe(true);
  });

  test("Muse từ chối: báo REFUSED kèm câu Muse trả, không chờ hết giờ", async () => {
    test.setTimeout(90_000);
    const started = Date.now();
    await expect(imageRun("/refuse")).rejects.toThrow(/Muse từ chối tạo ảnh: ".*không thể tạo/);
    expect(Date.now() - started).toBeLessThan(60_000);
  });

  test("không có nút chat mới + Muse vẽ lại video cũ dưới link mới: bỏ qua video cũ, chỉ nhận clip mới", async () => {
    const oldCopy = await env.storage.tmpPath("mp4");
    const { copyFile } = await import("node:fs/promises");
    await copyFile(clips.old!, oldCopy);
    await env.storage.importFile(oldCopy, { kind: "video", source: "muse:truoc-day" });

    const second = await env.ffmpeg.makeTestClip({ out: clips.new!, durationSec: 5, colorHex: "0000aa", width: 1280, height: 720 }).then(() => run("/nonewchat"));
    expect(env.storage.getMedia(second.result.mediaId)!.sha256).toBe(await env.storage.sha256File(clips.new!));
    expect(second.messages).toContain("Không thấy nút chat mới, dùng đoạn chat hiện tại");
  });
});
