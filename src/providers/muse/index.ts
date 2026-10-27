import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, ElementHandle, Page } from "playwright";
import type { AppConfig } from "../../core/config";
import { hammingDistance } from "../../core/ffmpeg";
import { ProviderError, type GeneratedImage, type GeneratedVideo, type MediaProvider, type ProviderContext } from "../types";
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
const SAME_IMAGE_MAX_BITS = 6;
const REFUSAL_GRACE_MS = 25_000;

export function videoWaitMs(durationSec: number): number {
  return (durationSec > 5 ? 420 : 300) * 1000;
}
export const IMAGE_WAIT_MS = 180_000;

export function assertMuseAllowed(cfg: Pick<AppConfig, "appEnv" | "museLive">): void {
  if (cfg.appEnv === "test" && !cfg.museLive) {
    throw new ProviderError("MUSE_BLOCKED_IN_TEST", "Test không được gọi Muse thật (đặt MUSE_LIVE=1 nếu thật sự muốn tốn lượt).");
  }
}

export function callJs(fnSource: string, ...args: unknown[]): string {
  return `(${fnSource})(${args.map((a) => JSON.stringify(a)).join(", ")})`;
}

export function findRefusal(newText: string): string | null {
  const m = REFUSAL_RE.exec(newText);
  if (!m) return null;
  const start = Math.max(0, m.index - 60);
  return newText.slice(start, m.index + 160).replace(/\s+/g, " ").trim();
}

type MuseJob = {
  kind: "image" | "video";
  text: string;
  attachments: string[];
  requestedSec: number;
  waitMs: number;
};

type Accepted = { mediaId: string; width: number; height: number; durationSec: number };

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

async function openFreshChat(page: Page, ctx: ProviderContext): Promise<ElementHandle> {
  let input = await firstVisible(page, CHAT_INPUT_SELECTORS, 20_000, ctx.signal);
  if (!input) {
    if (await page.evaluate<boolean>(callJs(LOGIN_WALL_JS))) {
      throw new ProviderError("SESSION_EXPIRED", "cần đăng nhập lại");
    }
    throw new ProviderError("INPUT_NOT_FOUND", "Không tìm thấy ô nhập chat của Muse (giao diện có thể đã đổi — sửa src/providers/muse/dom.ts)");
  }
  let newChat = await firstVisible(page, NEW_CHAT_SELECTORS, 3_000, ctx.signal);
  if (!newChat) {
    const switcher = await page.$(CHAT_SWITCHER_SELECTOR);
    if (switcher && (await switcher.isVisible())) {
      await switcher.click({ timeout: 5_000 });
      newChat = await firstVisible(page, NEW_SIDE_CHAT_IN_MENU_SELECTORS, 5_000, ctx.signal);
    }
  }
  if (newChat) {
    ctx.report("Mở đoạn chat phụ mới");
    await newChat.click({ timeout: 5_000 });
    await sleep(2500, ctx.signal);
    input = (await firstVisible(page, CHAT_INPUT_SELECTORS, 10_000, ctx.signal)) ?? input;
  } else {
    ctx.report("Không thấy nút chat mới, dùng đoạn chat hiện tại");
    await page.evaluate(callJs(SCROLL_CHAT_TO_END_JS));
    await sleep(3000, ctx.signal);
  }
  return input;
}

async function acceptCandidate(
  job: MuseJob,
  bytes: Uint8Array,
  ctx: ProviderContext,
  accId: string,
  attachmentHashes: bigint[],
  reasons: string[],
): Promise<Accepted | null> {
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
  const hash = await ctx.ffmpeg.averageHash(tmp);
  if (attachmentHashes.some((h) => hammingDistance(h, hash) <= SAME_IMAGE_MAX_BITS)) {
    reasons.push("trùng ảnh đính kèm (không phải ảnh mới tạo)");
    await ctx.storage.removeTemp(tmp);
    return null;
  }
  const norm = await ctx.storage.tmpPath("jpg");
  await ctx.ffmpeg.normalizeImage(tmp, norm);
  await ctx.storage.removeTemp(tmp);
  const rec = await ctx.storage.importFile(norm, { kind: "image", source: `muse:${accId}`, width: 1280, height: 720 });
  return { mediaId: rec.id, width: 1280, height: 720, durationSec: 0 };
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

  ctx.report("Mở muse.ai…");
  await page.goto(cfg.museUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await sleep(3000, ctx.signal);
  let input: ElementHandle;
  try {
    input = await openFreshChat(page, ctx);
  } catch (err) {
    if (err instanceof ProviderError && err.code === "SESSION_EXPIRED") {
      throw new ProviderError("SESSION_EXPIRED", `Tài khoản ${acc.id} cần đăng nhập lại (npm run muse:login -- ${acc.id})`);
    }
    throw err;
  }

  const attachmentHashes: bigint[] = [];
  for (const [i, file] of job.attachments.entries()) {
    ctx.report(`Đính kèm ảnh ${i + 1}/${job.attachments.length}…`);
    await attachFile(page, file, ctx.signal);
    attachmentHashes.push(await ctx.ffmpeg.averageHash(file));
  }

  const preSrcs = await page.evaluate<string[]>(callJs(MARK_EXISTING_MEDIA_JS));
  for (const s of preSrcs) preNet.add(s);
  const preText = await page.evaluate<string>(callJs(LOG_TEXT_JS));

  await input.fill(job.text);
  await sleep(500, ctx.signal);
  submitted = true;
  await submitPrompt(page, input, ctx.signal);

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
      const text = await page.evaluate<string>(callJs(LOG_TEXT_JS));
      const fresh = text.startsWith(preText) ? text.slice(preText.length) : text;
      const refusal = findRefusal(fresh.replace(job.text, ""));
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
      const bytes = await download(page, context, src);
      if (!bytes || bytes.length === 0) continue;
      const ok = await acceptCandidate(job, bytes, ctx, acc.id, attachmentHashes, reasons);
      if (ok) {
        const info = job.kind === "video" ? `${ok.width}x${ok.height} ${ok.durationSec.toFixed(1)}s` : `${ok.width}x${ok.height}`;
        ctx.report(`Đã nhận ${label} ${info} sau ${Math.round((Date.now() - started) / 1000)} giây`);
        return ok;
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
  const runJob = async (job: MuseJob, ctx: ProviderContext): Promise<Accepted> => {
    assertMuseAllowed(cfg);
    const acc = await pool.acquireWait(ctx.signal, () => ctx.report("Chờ tài khoản Muse rảnh…"));
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
      const r = await runJob(
        {
          kind: "video",
          text: formatVideoPrompt(req.prompt, req.durationSec, attachments.length > 0),
          attachments,
          requestedSec: req.durationSec,
          waitMs: videoWaitMs(req.durationSec),
        },
        ctx,
      );
      return { mediaId: r.mediaId, durationSec: r.durationSec, width: r.width, height: r.height };
    },

    async generateImage(req, ctx): Promise<GeneratedImage> {
      const r = await runJob(
        {
          kind: "image",
          text: formatImagePrompt(req.prompt, req.references.map((x) => x.role)),
          attachments: req.references.map((x) => mediaPath(ctx, x.mediaId)),
          requestedSec: 0,
          waitMs: IMAGE_WAIT_MS,
        },
        ctx,
      );
      return { mediaId: r.mediaId, width: r.width, height: r.height };
    },
  };
}
