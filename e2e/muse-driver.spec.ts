import { execFileSync } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createMuseProvider } from "../src/providers/muse";
import { createAccountPool } from "../src/providers/muse/accounts";
import { createTestEnv, type TestEnv } from "../tests/helpers/test-env";

const patterned = (lavfi: string, out: string) =>
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", lavfi, "-frames:v", "1", out], { windowsHide: true });

// Trang giả theo giao diện muse.ai đo 27/10/2026: menu Chats → mục "New side chat" (không phải <button>) → URL /thread/new → gửi tin → /thread/<id>.
const sideChatMenu = (clearLog: boolean) => `
<button data-testid="hatch-chat-switcher-trigger" onclick="document.getElementById('menu').hidden=false">Chats</button>
<div id="menu" hidden><div role="menuitem" onclick="${clearLog ? "document.getElementById('log').innerHTML='';" : ""} document.getElementById('menu').hidden=true; history.pushState({}, '', '/thread/new')">New side chat</div></div>`;

// Tài khoản đã có chat phụ: menu Chats mở bảng "Side chats" có nút "+" (data-testid hatch-chat-compose), bị ẩn cho tới khi mở menu.
const plusMenu = `
<button data-testid="hatch-chat-switcher-trigger" onclick="document.getElementById('panel').style.display='block'">Chats</button>
<div id="panel" style="display:none"><span>Side chats</span><button data-testid="hatch-chat-compose" aria-label="New side chat" onclick="document.getElementById('log').innerHTML=''; history.pushState({}, '', '/thread/new')">+</button></div>`;

const shell = (menu: string, initialLog: string, onSend: string) => `<!doctype html><html><body>
${menu}
<div role="log" id="log">${initialLog}</div>
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
const say = (html, ms) => setTimeout(() => {
  const d = document.createElement('div'); d.className = 'message'; d.innerHTML = html;
  document.getElementById('log').appendChild(d);
}, ms);
ta.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const bubble = document.createElement('div'); bubble.className = 'message';
  bubble.innerHTML = '<p>' + ta.value + '</p>' + (document.getElementById('previews').children.length ? '<img src="/attach-preview.png" width="600">' : '');
  document.getElementById('log').appendChild(bubble);
  document.getElementById('previews').innerHTML = '';
  ta.value = '';
  if (!location.pathname.startsWith('/thread/t-')) history.pushState({}, '', '/thread/t-' + Math.random().toString(36).slice(2, 8));
  ${onSend}
});
</script></body></html>`;

const OLD_VIDEO = `<div class="message"><video src="/old.mp4" width="640" muted preload="metadata"></video></div>`;
const videoPage = (menu: string, extra: string) => shell(menu, OLD_VIDEO, `${extra} say('<video src="/new.mp4" width="640" muted preload="metadata"></video>', 3500);`);
const imageOk = `say('<img src="/gen.jpg" width="640">', 3500);`;
const imageRefuse = `say('<p>Xin lỗi, mình không thể tạo hình ảnh này vì vi phạm nguyên tắc.</p>', 3500);`;
// Trả lời chữ theo 3 đợt (giống Muse gõ dần): đợt 1 lúc 3 giây, đợt 2 lúc 7 giây, đợt cuối lúc 11 giây.
const textReply = `const d = document.createElement("div"); d.className = "message"; document.getElementById("log").appendChild(d);
  setTimeout(() => { d.innerText = "Đây là kịch bản"; }, 3000);
  setTimeout(() => { d.innerText = "Đây là kịch bản\\n\`\`\`json\\n{\\"shots\\": ["; }, 7000);
  setTimeout(() => { d.innerText = "Đây là kịch bản\\n\`\`\`json\\n{\\"shots\\": [1, 2]}\\n\`\`\`"; }, 11000);`;
const imageFail = `say('<p>Mình đã thử nhưng dịch vụ tạo ảnh đang tạm lỗi nên không tạo được lúc này.</p>', 3500);`;

test.describe("Muse provider trên trang Muse giả (không tốn lượt thật)", () => {
  let env: TestEnv;
  let server: Server;
  let baseUrl = "";
  let flakyVisits = 0;
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
      if (url.startsWith("/thread/t-")) res.end(shell("", "<div class='message'><p>Ảnh chân dung trước đó</p></div>", imageOk));
      else if (url.startsWith("/image")) res.end(shell(sideChatMenu(true), "", imageOk));
      else if (url.startsWith("/refuse")) res.end(shell(sideChatMenu(true), "", imageRefuse));
      else if (url.startsWith("/flaky")) res.end(shell(sideChatMenu(true), "", ++flakyVisits === 1 ? imageFail : imageOk));
      else if (url.startsWith("/text")) res.end(shell(sideChatMenu(true), "", textReply));
      else if (url.startsWith("/plusmenu")) res.end(shell(plusMenu, "<div class='message'><p>chat chính cũ</p></div>", imageOk));
      else if (url.startsWith("/nosidechat")) res.end(videoPage("", ""));
      else if (url.startsWith("/keeplog")) res.end(videoPage(sideChatMenu(false), "say('<video src=\"/old-copy.mp4\" width=\"640\" muted></video>', 500);"));
      else res.end(videoPage(sideChatMenu(true), ""));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    mkdirSync(path.join(env.cfg.profilesDir, "muse_vid_01", "Default", "IndexedDB", "https_muse.ai_0.indexeddb.leveldb"), { recursive: true });
  });

  test.afterAll(async () => {
    await new Promise((r) => server.close(r));
    await env.cleanup();
  });

  const provider = (pathname: string) => {
    const cfg = { ...env.cfg, museLive: true, museUrl: `${baseUrl}${pathname}`, museChannel: process.env.CI ? ("chromium" as const) : ("chrome" as const) };
    return createMuseProvider(cfg, createAccountPool(cfg.profilesDir, 0));
  };
  const ctx = (messages: string[]) => ({ signal: new AbortController().signal, report: (m: string) => messages.push(m), storage: env.storage, ffmpeg: env.ffmpeg });

  test("video: mở chat phụ qua menu, gửi prompt, nhận đúng clip mới 5 giây", async () => {
    const messages: string[] = [];
    const result = await provider("/").generateVideo({ prompt: "a jaguar walks across a jungle river", durationSec: 5 }, ctx(messages));
    expect(result.durationSec).toBeGreaterThan(4.8);
    expect(env.storage.getMedia(result.mediaId)!.sha256).toBe(await env.storage.sha256File(clips.new!));
    expect(messages).toContain("Mở chat phụ mới");
  });

  test("không mở được chat phụ: báo lỗi, KHÔNG gửi vào chat chính", async () => {
    test.setTimeout(120_000);
    const messages: string[] = [];
    await expect(provider("/nosidechat").generateVideo({ prompt: "x", durationSec: 5 }, ctx(messages))).rejects.toThrow(/Không mở được chat phụ mới/);
    expect(messages.some((m) => m.startsWith("Muse đang tạo"))).toBe(false);
  });

  test("chat phụ còn video cũ + Muse vẽ lại video cũ dưới link mới: chỉ nhận clip mới", async () => {
    const oldCopy = await env.storage.tmpPath("mp4");
    await copyFile(clips.old!, oldCopy);
    await env.storage.importFile(oldCopy, { kind: "video", source: "muse:truoc-day" });
    await env.ffmpeg.makeTestClip({ out: clips.new!, durationSec: 5, colorHex: "0000aa", width: 1280, height: 720 });
    const result = await provider("/keeplog").generateVideo({ prompt: "x", durationSec: 5 }, ctx([]));
    expect(env.storage.getMedia(result.mediaId)!.sha256).toBe(await env.storage.sha256File(clips.new!));
  });

  test("ảnh có đính kèm: không nhận nhầm ảnh mình gửi, chuẩn hoá 1280x720, trả đường dẫn chat phụ", async () => {
    const messages: string[] = [];
    const result = await provider("/image").generateImage({ prompt: "she kneels by the campfire", references: [{ mediaId: refMediaId, role: "character" }], session: "new" }, ctx(messages));
    expect(result).toMatchObject({ width: 1280, height: 720 });
    expect(await env.ffmpeg.probeImage(env.storage.absPath(env.storage.getMedia(result.mediaId)!))).toEqual({ width: 1280, height: 720 });
    expect(result.session?.accountId).toBe("muse_vid_01");
    expect(result.session?.threadUrl).toMatch(/\/thread\/t-[a-z0-9]+$/);
    expect(messages).toContain("Đính kèm ảnh 1/1…");
  });

  test("tài khoản đã có chat phụ: mở menu rồi bấm nút + (hatch-chat-compose) để tạo chat phụ mới", async () => {
    const messages: string[] = [];
    const result = await provider("/plusmenu").generateImage({ prompt: "x", references: [], session: "new" }, ctx(messages));
    expect(messages).toContain("Mở chat phụ mới");
    expect(result.session?.threadUrl).toMatch(/\/thread\/t-/);
  });

  test("tiếp tục chat phụ của nhân vật: mở lại đúng đường dẫn chat, không mở chat mới", async () => {
    const messages: string[] = [];
    const threadUrl = `${baseUrl}/thread/t-abc123`;
    const result = await provider("/").generateImage({ prompt: "next photo, same woman", references: [], session: { accountId: "muse_vid_01", threadUrl } }, ctx(messages));
    expect(result.session?.threadUrl).toBe(threadUrl);
    expect(messages).toContain("Mở lại chat phụ của nhân vật…");
    expect(messages).not.toContain("Mở chat phụ mới");
  });

  test("chat phụ báo lỗi: mở chat phụ mới, thử lại với ảnh dự phòng và thành công", async () => {
    test.setTimeout(150_000);
    const messages: string[] = [];
    const result = await provider("/flaky").generateImage(
      { prompt: "in-chat prompt", references: [], session: "new", fallback: { prompt: "the same woman as in the attached photo", references: [{ mediaId: refMediaId, role: "character" }] } },
      ctx(messages),
    );
    expect(result.width).toBe(1280);
    expect(messages.some((m) => m.includes("MUSE_FAILED") && m.includes("thử lại lần 2/2"))).toBe(true);
    expect(messages).toContain("Đính kèm ảnh 1/1…");
  });

  test("chữ: chờ câu trả lời đứng yên mới nhận (không đọc đợt gõ dở), trả đường dẫn chat phụ", async () => {
    test.setTimeout(120_000);
    const messages: string[] = [];
    const result = await provider("/text").generateText({ prompt: "Viết kịch bản 2 cảnh" }, ctx(messages));
    expect(result.text).toContain("\"shots\": [1, 2]}");
    expect(result.text).not.toContain("Viết kịch bản 2 cảnh");
    expect(result.session.threadUrl).toMatch(/\/thread\/t-/);
  });

  test("Muse từ chối cả 2 lần: dừng, báo REFUSED, không lặp", async () => {
    test.setTimeout(180_000);
    const messages: string[] = [];
    await expect(provider("/refuse").generateImage({ prompt: "x", references: [] }, ctx(messages))).rejects.toThrow(/Muse từ chối tạo ảnh: ".*không thể tạo/);
    expect(messages.filter((m) => m.includes("thử lại lần")).length).toBe(1);
  });
});
