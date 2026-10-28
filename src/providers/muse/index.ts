import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, ElementHandle, Page } from "playwright";
import type { AppConfig } from "../../core/config";
import { ProviderError, type GeneratedImage, type GeneratedText, type GeneratedVideo, type MediaProvider, type ProviderContext } from "../types";
import { createAccountPool, type AccountPool, type MuseAccount } from "./accounts";
import { launchProfile } from "./browser";
import {
  ALLOW_BUTTON_SELECTOR,
  ATTACH_BUTTON_SELECTOR,
  BLOB_TO_DATAURL_JS,
  CHAT_INPUT_SELECTORS,
  CHAT_SWITCHER_SELECTOR,
  COMPOSER_ATTACHMENT_COUNT_JS,
  FIND_NEW_IMAGE_JS,
  FIND_NEW_VIDEO_JS,
  LOG_TEXT_JS,
  LOGIN_WALL_JS,
  MUSE_FAILURE_RE,
  MARK_EXISTING_MEDIA_JS,
  NEW_CHAT_SELECTORS,
  NEW_SIDE_CHAT_IN_MENU_SELECTORS,
  REFUSAL_RE,
  SCROLL_CHAT_TO_END_JS,
  SEND_BUTTON_SELECTOR,
  type MediaCandidate,
} from "./dom";
import { formatImagePrompt, formatVideoPrompt } from "./prompt";
import { validateVideoProbe } from "./validate";

const SCAN_INTERVAL_MS = 3_000;
const STABLE_CHECKS = 2;
const MIN_IMAGE_SIDE = 512;
const OWN_BUBBLE_SETTLE_MS = 2_000;
const REFUSAL_GRACE_MS = 25_000;

export function videoWaitMs(durationSec: number): number {
  return (durationSec > 5 ? 720 : 600) * 1000;
}
export const IMAGE_WAIT_MS = 180_000;
export const TEXT_WAIT_MS = 240_000;
const TEXT_STABLE_CHECKS = 3;
const MIN_TEXT_CHARS = 20;

export function assertMuseAllowed(cfg: Pick<AppConfig, "appEnv" | "museLive">): void {
  if (cfg.appEnv === "test" && !cfg.museLive) {
    throw new ProviderError("MUSE_BLOCKED_IN_TEST", "Test không được gọi Muse thật (đặt MUSE_LIVE=1 nếu thật sự muốn tốn lượt).");
  }
}

export function callJs(fnSource: string, ...args: unknown[]): string {
  return `(${fnSource})(${args.map((a) => JSON.stringify(a)).join(", ")})`;
}

function excerpt(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  if (!m) return null;
  const start = Math.max(0, m.index - 60);
  return text.slice(start, m.index + 160).replace(/\s+/g, " ").trim();
}

export const findRefusal = (reply: string) => excerpt(reply, REFUSAL_RE);
export const findMuseFailure = (reply: string) => excerpt(reply, MUSE_FAILURE_RE);

export function replyAfterPrompt(logText: string, prompt: string, preText: string): string {
  const marker = prompt.slice(0, 60);
  const at = logText.lastIndexOf(marker);
  if (at >= 0) return logText.slice(at + prompt.length);
  return logText.startsWith(preText) ? logText.slice(preText.length) : "";
}

type MuseJob = {
  kind: "image" | "video" | "text";
  text: string;
  attachments: string[];
  requestedSec: number;
  waitMs: number;
  threadUrl?: string;
  accountId?: string;
  // Chữ: câu đánh dấu cuối prompt; câu trả lời = phần chữ sau lần xuất hiện đầu tiên của nó trong chat.
  replyMarker?: string;
};

type MediaAccepted = { kind: "media"; mediaId: string; width: number; height: number; durationSec: number; threadUrl: string; accountId: string };
type TextAccepted = { kind: "text"; text: string; threadUrl: string; accountId: string };
type Accepted = MediaAccepted | TextAccepted;

function expectMedia(r: Accepted): MediaAccepted {
  if (r.kind !== "media") throw new ProviderError("WRONG_RESULT", "Muse trả chữ trong khi cần ảnh/video");
  return r;
}

export const MAX_JOB_ATTEMPTS = 2;
const RETRY_IN_NEW_SIDE_CHAT = new Set(["REFUSED", "MUSE_FAILED", "NO_MEDIA", "NO_TEXT", "SIDE_CHAT_FAILED", "THREAD_NOT_FOUND"]);

export function isSideChatThread(url: string): boolean {
  return /\/thread\/(?!new(?:[/?#]|$))[^/?#]+/.test(url);
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("Đã dừng"));
    }, { once: true });
  });
}

async function firstVisible(page: Page, selectors: string[], timeoutMs: number, signal: AbortSignal): Promise<ElementHandle | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el && (await el.isVisible())) return el;
    }
    await sleep(500, signal);
  }
  return null;
}

async function inputValue(el: ElementHandle): Promise<string> {
  const hasValue = await el.evaluate((e) => "value" in e);
  return hasValue ? await (el as ElementHandle<HTMLTextAreaElement>).inputValue() : await el.innerText();
}

async function submitPrompt(page: Page, input: ElementHandle, signal: AbortSignal): Promise<void> {
  await input.focus();
  await page.keyboard.press("Enter");
  const deadline = Date.now() + 20_000;
  let clicked = false;
  while (Date.now() < deadline) {
    await sleep(1000, signal);
    if (!(await inputValue(input)).trim()) return;
    if (!clicked) {
      const btn = await page.$(SEND_BUTTON_SELECTOR);
      if (btn && (await btn.isVisible()) && (await btn.isEnabled())) {
        await btn.click({ timeout: 5_000 });
        clicked = true;
      }
    }
  }
  throw new ProviderError("PROMPT_NOT_SENT", "Không gửi được prompt lên Muse (ô nhập vẫn còn chữ sau 20 giây)");
}

async function attachFile(page: Page, file: string, signal: AbortSignal): Promise<void> {
  const before = await page.evaluate<number>(callJs(COMPOSER_ATTACHMENT_COUNT_JS));
  const input = await page.$("input[type=file]");
  if (input) {
    await input.setInputFiles(file);
  } else {
    const btn = await page.$(ATTACH_BUTTON_SELECTOR);
    if (!btn) throw new ProviderError("ATTACH_FAILED", "Không tìm thấy nút/ô đính kèm file trên Muse");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 8_000 }), btn.click({ timeout: 5_000 })]);
    await chooser.setFiles(file);
  }
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const after = await page.evaluate<number>(callJs(COMPOSER_ATTACHMENT_COUNT_JS));
    if (before >= 0 && after > before) {
      await sleep(1500, signal);
      return;
    }
    await sleep(1000, signal);
  }
  throw new ProviderError("ATTACH_FAILED", `Muse không hiện ảnh đính kèm ${path.basename(file)} sau 20 giây`);
}

async function download(page: Page, context: BrowserContext, src: string): Promise<Uint8Array | null> {
  if (src.startsWith("blob:")) {
    const dataUrl = await page.evaluate<string | null>(callJs(BLOB_TO_DATAURL_JS, src));
    return dataUrl?.includes(",") ? Buffer.from(dataUrl.split(",", 2)[1]!, "base64") : null;
  }
  if (src.startsWith("data:")) return Buffer.from(src.split(",", 2)[1] ?? "", "base64");
  const res = await context.request.get(src, { timeout: 90_000 });
  return res.ok() ? await res.body() : null;
}

async function captureDebug(cfg: AppConfig, page: Page, accId: string): Promise<string> {
  const dir = path.join(cfg.dataDir, "debug");
  await mkdir(dir, { recursive: true });
  const base = path.join(dir, `muse-${accId}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await page.screenshot({ path: `${base}.png`, fullPage: false, timeout: 10_000 });
  await writeFile(`${base}.html`, await page.content());
  return base;
}

async function findChatInput(page: Page, ctx: ProviderContext): Promise<ElementHandle> {
  const input = await firstVisible(page, CHAT_INPUT_SELECTORS, 20_000, ctx.signal);
  if (input) return input;
  if (await page.evaluate<boolean>(callJs(LOGIN_WALL_JS))) throw new ProviderError("SESSION_EXPIRED", "cần đăng nhập lại");
  throw new ProviderError("INPUT_NOT_FOUND", "Không tìm thấy ô nhập chat của Muse (giao diện có thể đã đổi — sửa src/providers/muse/dom.ts)");
}

async function openSideChat(page: Page, ctx: ProviderContext): Promise<ElementHandle> {
  await findChatInput(page, ctx);
  let newChat = await firstVisible(page, NEW_CHAT_SELECTORS, 3_000, ctx.signal);
  if (!newChat) {
    const switcher = await page.$(CHAT_SWITCHER_SELECTOR);
    if (switcher && (await switcher.isVisible())) {
      await switcher.click({ timeout: 5_000 });
      newChat = await firstVisible(page, [...NEW_CHAT_SELECTORS, ...NEW_SIDE_CHAT_IN_MENU_SELECTORS], 5_000, ctx.signal);
    }
  }
  if (!newChat) throw new ProviderError("SIDE_CHAT_FAILED", "Không mở được chat phụ mới trên Muse (không gửi vào chat chính)");
  ctx.report("Mở chat phụ mới");
  await newChat.click({ timeout: 5_000 });
  await sleep(2500, ctx.signal);
  return findChatInput(page, ctx);
}

async function waitThreadUrl(page: Page, signal: AbortSignal): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (isSideChatThread(page.url())) return page.url();
    await sleep(500, signal);
  }
  return page.url();
}

async function acceptCandidate(
  job: MuseJob,
  bytes: Uint8Array,
  ctx: ProviderContext,
  accId: string,
  reasons: string[],
): Promise<Omit<MediaAccepted, "kind" | "threadUrl" | "accountId"> | null> {
  const tmp = await ctx.storage.writeTemp(bytes, job.kind === "video" ? "mp4" : "img");
  const sha = await ctx.storage.sha256File(tmp);
  if (ctx.storage.hasSha256(sha)) {
    reasons.push(`trùng một ${job.kind === "video" ? "video" : "ảnh"} đã có`);
    await ctx.storage.removeTemp(tmp);
    return null;
  }
  if (job.kind === "video") {
    const probe = await ctx.ffmpeg.probeVideo(tmp).catch(() => null);
    const verdict = probe ? validateVideoProbe(probe, job.requestedSec) : { ok: false as const, reason: "không phải file video" };
    if (!probe || !verdict.ok) {
      if (!verdict.ok) reasons.push(verdict.reason);
      await ctx.storage.removeTemp(tmp);
      return null;
    }
    const rec = await ctx.storage.importFile(tmp, { kind: "video", source: `muse:${accId}`, width: probe.width, height: probe.height, durationSec: probe.durationSec });
    return { mediaId: rec.id, width: probe.width, height: probe.height, durationSec: probe.durationSec };
  }
  const probe = await ctx.ffmpeg.probeImage(tmp).catch(() => null);
  if (!probe || Math.min(probe.width, probe.height) < MIN_IMAGE_SIDE) {
    reasons.push(probe ? `ảnh quá nhỏ ${probe.width}x${probe.height}` : "không phải file ảnh");
    await ctx.storage.removeTemp(tmp);
    return null;
  }
  const norm = await ctx.storage.tmpPath("jpg");
  await ctx.ffmpeg.normalizeImage(tmp, norm);
  await ctx.storage.removeTemp(tmp);
  const rec = await ctx.storage.importFile(norm, { kind: "image", source: `muse:${accId}`, width: 1280, height: 720 });
  return { mediaId: rec.id, width: 1280, height: 720, durationSec: 0 };
}

export function replyAfterMarker(logText: string, marker: string, preText: string): string {
  const fresh = logText.startsWith(preText) ? logText.slice(preText.length) : logText;
  const at = fresh.indexOf(marker);
  return at >= 0 ? fresh.slice(at + marker.length).trim() : "";
}

async function waitForText(page: Page, job: MuseJob, preText: string, accId: string, ctx: ProviderContext): Promise<string> {
  const marker = job.replyMarker ?? job.text.slice(-40);
  const started = Date.now();
  let last = "";
  let stable = 0;
  while (Date.now() - started < job.waitMs) {
    if (page.isClosed()) throw new ProviderError("PAGE_CLOSED", "Trang Muse bị đóng giữa chừng");
    ctx.report(`Muse đang viết… ${Math.round((Date.now() - started) / 1000)} giây (${accId})`);
    const reply = replyAfterMarker(await page.evaluate<string>(callJs(LOG_TEXT_JS)), marker, preText);
    if (reply.length >= MIN_TEXT_CHARS && reply === last) {
      stable++;
      if (stable >= TEXT_STABLE_CHECKS) {
        if (!reply.includes("{")) {
          const failure = findMuseFailure(reply);
          if (failure) throw new ProviderError("MUSE_FAILED", `Muse báo lỗi khi viết: "${failure}". Thường là lỗi tạm phía Muse — chạy lại sau.`);
          const refusal = findRefusal(reply);
          if (refusal) throw new ProviderError("REFUSED", `Muse từ chối viết: "${refusal}".`);
        }
        return reply;
      }
    } else {
      stable = 0;
      last = reply;
    }
    await sleep(SCAN_INTERVAL_MS, ctx.signal);
  }
  throw new ProviderError("NO_TEXT", `Muse chưa trả lời xong sau ${Math.round(job.waitMs / 1000)} giây${last ? ` (đang có ${last.length} ký tự)` : ""}.`);
}

async function driveMuse(cfg: AppConfig, acc: MuseAccount, job: MuseJob, ctx: ProviderContext, context: BrowserContext, page: Page): Promise<Accepted> {
  const netCandidates: string[] = [];
  const preNet = new Set<string>();
  let submitted = false;
  page.on("response", (response) => {
    const ctype = (response.headers()["content-type"] ?? "").toLowerCase();
    if (!ctype.includes(job.kind === "video" ? "video/mp4" : "image/")) return;
    const url = response.url();
    if (!submitted) preNet.add(url);
    else if (job.kind === "video" && !preNet.has(url) && !netCandidates.includes(url)) netCandidates.push(url);
  });

  let input: ElementHandle;
  try {
    if (job.threadUrl) {
      ctx.report("Mở lại chat phụ của nhân vật…");
      await page.goto(job.threadUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await sleep(3000, ctx.signal);
      input = await findChatInput(page, ctx);
      if (!page.url().startsWith(job.threadUrl.split("?")[0]!)) {
        throw new ProviderError("THREAD_NOT_FOUND", "Chat phụ của nhân vật không còn mở được");
      }
      await page.evaluate(callJs(SCROLL_CHAT_TO_END_JS));
      await sleep(1500, ctx.signal);
    } else {
      ctx.report("Mở muse.ai…");
      await page.goto(cfg.museUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await sleep(3000, ctx.signal);
      input = await openSideChat(page, ctx);
    }
  } catch (err) {
    if (err instanceof ProviderError && err.code === "SESSION_EXPIRED") {
      throw new ProviderError("SESSION_EXPIRED", `Tài khoản ${acc.id} cần đăng nhập lại (npm run muse:login -- ${acc.id})`);
    }
    throw err;
  }

  for (const [i, file] of job.attachments.entries()) {
    ctx.report(`Đính kèm ảnh ${i + 1}/${job.attachments.length}…`);
    await attachFile(page, file, ctx.signal);
  }

  const preSrcs: string[] = await page.evaluate<string[]>(callJs(MARK_EXISTING_MEDIA_JS));
  for (const s of preSrcs) preNet.add(s);
  const preText = await page.evaluate<string>(callJs(LOG_TEXT_JS));

  await input.fill(job.text);
  await sleep(500, ctx.signal);
  submitted = true;
  await submitPrompt(page, input, ctx.signal);
  await sleep(OWN_BUBBLE_SETTLE_MS, ctx.signal);
  preSrcs.push(...(await page.evaluate<string[]>(callJs(MARK_EXISTING_MEDIA_JS))));
  const threadUrl = job.threadUrl ?? (await waitThreadUrl(page, ctx.signal));
  if (job.kind === "text") return { kind: "text", text: await waitForText(page, job, preText, acc.id, ctx), threadUrl, accountId: acc.id };

  const started = Date.now();
  const deadline = started + job.waitMs;
  const rejected = new Set<string>();
  const seen = new Map<string, number>();
  const reasons: string[] = [];
  let refusalSeen: string | null = null;
  const label = job.kind === "video" ? "video" : "ảnh";

  while (Date.now() < deadline) {
    if (page.isClosed()) throw new ProviderError("PAGE_CLOSED", "Trang Muse bị đóng giữa chừng");
    ctx.report(`Muse đang tạo ${label}… ${Math.round((Date.now() - started) / 1000)} giây (${acc.id})`);

    const allow = await page.$(ALLOW_BUTTON_SELECTOR);
    if (allow && (await allow.isVisible())) {
      await allow.click({ timeout: 3_000 }).then(
        () => ctx.report("Muse hỏi phê duyệt, đã bấm Cho phép"),
        (err: unknown) => ctx.report(`Thấy nút Cho phép nhưng không bấm được (${err instanceof Error ? err.message.split("\n")[0] : String(err)})`),
      );
    }

    const found = await page.evaluate<MediaCandidate[]>(callJs(job.kind === "video" ? FIND_NEW_VIDEO_JS : FIND_NEW_IMAGE_JS, [preSrcs, [...rejected]]));
    if (!Array.isArray(found)) throw new ProviderError("SCAN_FAILED", "Đoạn quét trong trang Muse không trả danh sách");
    const srcs = [...new Set([...found.map((c) => c.src), ...netCandidates.filter((u) => !rejected.has(u))])];

    if (srcs.length === 0 && Date.now() - started > REFUSAL_GRACE_MS) {
      const reply = replyAfterPrompt(await page.evaluate<string>(callJs(LOG_TEXT_JS)), job.text, preText);
      const failure = findMuseFailure(reply);
      if (failure) throw new ProviderError("MUSE_FAILED", `Muse báo lỗi khi tạo ${label}: "${failure}". Thường là lỗi tạm phía Muse — chạy lại sau.`);
      const refusal = findRefusal(reply);
      if (refusal && refusalSeen === refusal) {
        throw new ProviderError("REFUSED", `Muse từ chối tạo ${label}: "${refusal}". Thử viết lại prompt nhẹ nhàng hơn.`);
      }
      refusalSeen = refusal;
    }

    for (const src of srcs) {
      const n = (seen.get(src) ?? 0) + 1;
      seen.set(src, n);
      if (n < STABLE_CHECKS) continue;
      rejected.add(src);
      const bytes = await download(page, context, src).catch((err: unknown) => {
        reasons.push(`không tải được ${label} (${err instanceof Error ? err.message.split("\n")[0] : String(err)})`);
        return null;
      });
      if (!bytes || bytes.length === 0) continue;
      const ok = await acceptCandidate(job, bytes, ctx, acc.id, reasons);
      if (ok) {
        const info = job.kind === "video" ? `${ok.width}x${ok.height} ${ok.durationSec.toFixed(1)}s` : `${ok.width}x${ok.height}`;
        ctx.report(`Đã nhận ${label} ${info} sau ${Math.round((Date.now() - started) / 1000)} giây`);
        return { kind: "media", ...ok, threadUrl, accountId: acc.id };
      }
    }
    await sleep(SCAN_INTERVAL_MS, ctx.signal);
  }
  const why = reasons.length ? ` Đã loại: ${[...new Set(reasons)].join("; ")}.` : "";
  throw new ProviderError("NO_MEDIA", `Không nhận được ${label} hợp lệ sau ${Math.round(job.waitMs / 1000)} giây.${why}`);
}

async function runOnAccount(cfg: AppConfig, acc: MuseAccount, job: MuseJob, ctx: ProviderContext): Promise<Accepted> {
  ctx.report(`Mở Chrome hồ sơ ${acc.id}…`);
  const context = await launchProfile(acc.profileDir, cfg.museHeadless, cfg.museChannel);
  const page = context.pages()[0] ?? (await context.newPage());
  try {
    return await driveMuse(cfg, acc, job, ctx, context, page);
  } catch (err) {
    if (!page.isClosed()) {
      const where = await captureDebug(cfg, page, acc.id).catch((e: unknown) => `không chụp được (${e instanceof Error ? e.message : String(e)})`);
      ctx.report(`Đã lưu ảnh và HTML trang Muse lúc lỗi: ${where}`);
      if (err instanceof Error) err.message = `${err.message} [ảnh lỗi: ${where}.png]`;
    }
    throw err;
  } finally {
    await context.close();
  }
}

export function createMuseProvider(cfg: AppConfig, pool: AccountPool = createAccountPool(cfg.profilesDir)): MediaProvider {
  const runOnce = async (job: MuseJob, ctx: ProviderContext): Promise<Accepted> => {
    const acc = job.accountId
      ? await pool.acquireSpecific(job.accountId, ctx.signal, () => ctx.report(`Chờ tài khoản ${job.accountId} rảnh…`))
      : await pool.acquireWait(ctx.signal, () => ctx.report("Chờ tài khoản Muse rảnh…"));
    try {
      const result = await runOnAccount(cfg, acc, job, ctx);
      pool.release(acc.id, "ok");
      return result;
    } catch (err) {
      pool.release(acc.id, err instanceof ProviderError && err.code === "SESSION_EXPIRED" ? "needs_login" : "cooldown");
      if (err instanceof ProviderError) throw err;
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      throw new ProviderError("BROWSER_ERROR", `Lỗi khi điều khiển Muse bằng hồ sơ ${acc.id}: ${msg}`, { cause: err });
    }
  };

  const runJob = async (job: MuseJob, ctx: ProviderContext, retryJob?: MuseJob): Promise<Accepted> => {
    assertMuseAllowed(cfg);
    let attempt: MuseJob = job;
    for (let i = 1; ; i++) {
      try {
        return await runOnce(attempt, ctx);
      } catch (err) {
        const code = err instanceof ProviderError ? err.code : "";
        if (i >= MAX_JOB_ATTEMPTS || !RETRY_IN_NEW_SIDE_CHAT.has(code)) throw err;
        ctx.report(`Chat phụ không tạo được (${code}) — mở chat phụ mới, thử lại lần ${i + 1}/${MAX_JOB_ATTEMPTS}`);
        attempt = { ...(retryJob ?? job), threadUrl: undefined, accountId: undefined };
      }
    }
  };

  const mediaPath = (ctx: ProviderContext, mediaId: string) => {
    const rec = ctx.storage.getMedia(mediaId);
    if (!rec) throw new ProviderError("MISSING_INPUT", `Không tìm thấy ảnh ${mediaId} để đính kèm`);
    return ctx.storage.absPath(rec);
  };

  return {
    id: "muse",
    maxParallel: () => Math.max(1, pool.loggedInCount()),

    async generateVideo(req, ctx): Promise<GeneratedVideo> {
      const attachments = req.firstFrameMediaId ? [mediaPath(ctx, req.firstFrameMediaId)] : [];
      const r = expectMedia(await runJob(
        {
          kind: "video",
          text: req.verbatim ? req.prompt.trim() : formatVideoPrompt(req.prompt, req.durationSec, attachments.length > 0),
          attachments,
          requestedSec: req.durationSec,
          waitMs: videoWaitMs(req.durationSec),
          threadUrl: req.session?.threadUrl,
          accountId: req.session?.accountId,
        },
        ctx,
      ));
      return { mediaId: r.mediaId, durationSec: r.durationSec, width: r.width, height: r.height };
    },

    async generateImage(req, ctx): Promise<GeneratedImage> {
      const toJob = (prompt: string, refs: typeof req.references): MuseJob => ({
        kind: "image",
        text: req.verbatim ? prompt.trim() : formatImagePrompt(prompt, refs.map((x) => x.role)),
        attachments: refs.map((x) => mediaPath(ctx, x.mediaId)),
        requestedSec: 0,
        waitMs: IMAGE_WAIT_MS,
      });
      const session = req.session && req.session !== "new" ? req.session : undefined;
      const job = { ...toJob(req.prompt, req.references), threadUrl: session?.threadUrl, accountId: session?.accountId };
      const retry = req.fallback ? toJob(req.fallback.prompt, req.fallback.references) : undefined;
      const r = expectMedia(await runJob(job, ctx, retry));
      return { mediaId: r.mediaId, width: r.width, height: r.height, session: { accountId: r.accountId, threadUrl: r.threadUrl } };
    },

    async generateText(req, ctx): Promise<GeneratedText> {
      const toJob = (prompt: string): MuseJob => {
        const replyMarker = `(Mã yêu cầu: ${randomUUID().slice(0, 8)})`;
        return { kind: "text", text: `${prompt.trim()}

${replyMarker}`, attachments: [], requestedSec: 0, waitMs: TEXT_WAIT_MS, replyMarker };
      };
      if (!req.prompt.trim()) throw new Error("Prompt đang trống");
      const job = { ...toJob(req.prompt), threadUrl: req.session?.threadUrl, accountId: req.session?.accountId };
      const r = await runJob(job, ctx, req.fallbackPrompt ? toJob(req.fallbackPrompt) : undefined);
      if (r.kind !== "text") throw new ProviderError("WRONG_RESULT", "Muse trả ảnh/video trong khi cần chữ");
      return { text: r.text, session: { accountId: r.accountId, threadUrl: r.threadUrl } };
    },
  };
}
