import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, ElementHandle, Page } from "playwright";
import type { AppConfig } from "../../core/config";
import { ProviderError, type GeneratedVideo, type ProviderContext, type VideoProvider, type VideoRequest } from "../types";
import { createAccountPool, type AccountPool, type MuseAccount } from "./accounts";
import { launchProfile } from "./browser";
import {
  ALLOW_BUTTON_SELECTOR,
  BLOB_TO_DATAURL_JS,
  CHAT_INPUT_SELECTORS,
  CHAT_SWITCHER_SELECTOR,
  NEW_SIDE_CHAT_IN_MENU_SELECTORS,
  FIND_NEW_VIDEO_JS,
  LOGIN_WALL_JS,
  MARK_EXISTING_MEDIA_JS,
  NEW_CHAT_SELECTORS,
  SCROLL_CHAT_TO_END_JS,
  SEND_BUTTON_SELECTOR,
  type MediaCandidate,
} from "./dom";
import { formatVideoPrompt } from "./prompt";
import { validateVideoProbe } from "./validate";

const SCAN_INTERVAL_MS = 3_000;
const STABLE_CHECKS = 2;

export function videoWaitMs(durationSec: number): number {
  return (durationSec > 5 ? 420 : 300) * 1000;
}

export function assertMuseAllowed(cfg: Pick<AppConfig, "appEnv" | "museLive">): void {
  if (cfg.appEnv === "test" && !cfg.museLive) {
    throw new ProviderError("MUSE_BLOCKED_IN_TEST", "Test không được gọi Muse thật (đặt MUSE_LIVE=1 nếu thật sự muốn tốn lượt).");
  }
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
        await btn.click();
        clicked = true;
      }
    }
  }
  throw new ProviderError("PROMPT_NOT_SENT", "Không gửi được prompt lên Muse (ô nhập vẫn còn chữ sau 20 giây)");
}

export function callJs(fnSource: string, ...args: unknown[]): string {
  return `(${fnSource})(${args.map((a) => JSON.stringify(a)).join(", ")})`;
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

async function generateOnAccount(cfg: AppConfig, acc: MuseAccount, req: VideoRequest, ctx: ProviderContext): Promise<GeneratedVideo> {
  ctx.report(`Mở Chrome hồ sơ ${acc.id}…`);
  const context = await launchProfile(acc.profileDir, cfg.museHeadless, cfg.museChannel);
  const page = context.pages()[0] ?? (await context.newPage());
  try {
    return await driveMuse(cfg, acc, req, ctx, context, page);
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

async function driveMuse(
  cfg: AppConfig,
  acc: MuseAccount,
  req: VideoRequest,
  ctx: ProviderContext,
  context: BrowserContext,
  page: Page,
): Promise<GeneratedVideo> {
  {
    const netCandidates: string[] = [];
    const preNet = new Set<string>();
    let submitted = false;
    page.on("response", (response) => {
      const ctype = (response.headers()["content-type"] ?? "").toLowerCase();
      if (!ctype.includes("video/mp4")) return;
      const url = response.url();
      if (!submitted) preNet.add(url);
      else if (!preNet.has(url) && !netCandidates.includes(url)) netCandidates.push(url);
    });

    ctx.report("Mở muse.ai…");
    await page.goto(cfg.museUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await sleep(3000, ctx.signal);

    let input = await firstVisible(page, CHAT_INPUT_SELECTORS, 20_000, ctx.signal);
    if (!input) {
      if (await page.evaluate<boolean>(callJs(LOGIN_WALL_JS))) {
        throw new ProviderError("SESSION_EXPIRED", `Tài khoản ${acc.id} cần đăng nhập lại (npm run muse:login -- ${acc.id})`);
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

    const preSrcs = await page.evaluate<string[]>(callJs(MARK_EXISTING_MEDIA_JS));
    for (const s of preSrcs) preNet.add(s);

    const prompt = formatVideoPrompt(req.prompt, req.durationSec);
    await input.fill(prompt);
    await sleep(500, ctx.signal);
    submitted = true;
    await submitPrompt(page, input, ctx.signal);

    const started = Date.now();
    const deadline = started + videoWaitMs(req.durationSec);
    const rejected = new Set<string>();
    const seen = new Map<string, number>();
    const reasons: string[] = [];

    while (Date.now() < deadline) {
      if (page.isClosed()) throw new ProviderError("PAGE_CLOSED", "Trang Muse bị đóng giữa chừng");
      ctx.report(`Muse đang tạo video… ${Math.round((Date.now() - started) / 1000)} giây`);

      const allow = await page.$(ALLOW_BUTTON_SELECTOR);
      if (allow && (await allow.isVisible())) {
        await allow.click({ timeout: 3_000 }).then(
          () => ctx.report("Muse hỏi phê duyệt, đã bấm Cho phép"),
          (err: unknown) => ctx.report(`Thấy nút Cho phép nhưng không bấm được (${err instanceof Error ? err.message.split("\n")[0] : String(err)})`),
        );
      }

      const found = await page.evaluate<MediaCandidate[]>(callJs(FIND_NEW_VIDEO_JS, [preSrcs, [...rejected]]));
      if (!Array.isArray(found)) throw new ProviderError("SCAN_FAILED", "Đoạn quét video trong trang Muse không trả danh sách");
      const srcs = [...new Set([...found.map((c) => c.src), ...netCandidates.filter((u) => !rejected.has(u))])];
      for (const src of srcs) {
        const n = (seen.get(src) ?? 0) + 1;
        seen.set(src, n);
        if (n < STABLE_CHECKS) continue;
        const bytes = await download(page, context, src);
        if (!bytes || bytes.length === 0) {
          rejected.add(src);
          continue;
        }
        const tmp = await ctx.storage.writeTemp(bytes, "mp4");
        const sha = await ctx.storage.sha256File(tmp);
        if (ctx.storage.hasSha256(sha)) {
          reasons.push("trùng một video đã nhận trước đây");
          rejected.add(src);
          await ctx.storage.removeTemp(tmp);
          continue;
        }
        const probe = await ctx.ffmpeg.probeVideo(tmp).catch((err: unknown) => {
          reasons.push(`không đọc được video (${err instanceof Error ? err.message : String(err)})`);
          return null;
        });
        const verdict = probe ? validateVideoProbe(probe, req.durationSec) : { ok: false as const, reason: "không phải file video" };
        if (!probe || !verdict.ok) {
          if (!verdict.ok) reasons.push(verdict.reason);
          rejected.add(src);
          await ctx.storage.removeTemp(tmp);
          continue;
        }
        const rec = await ctx.storage.importFile(tmp, {
          kind: "video",
          source: `muse:${acc.id}`,
          width: probe.width,
          height: probe.height,
          durationSec: probe.durationSec,
        });
        ctx.report(`Đã nhận video ${probe.width}x${probe.height} ${probe.durationSec.toFixed(1)}s sau ${Math.round((Date.now() - started) / 1000)} giây`);
        return { mediaId: rec.id, durationSec: probe.durationSec, width: probe.width, height: probe.height };
      }
      await sleep(SCAN_INTERVAL_MS, ctx.signal);
    }
    const why = reasons.length ? ` Các video bị loại: ${[...new Set(reasons)].join("; ")}.` : "";
    throw new ProviderError("NO_MEDIA", `Không nhận được video hợp lệ sau ${Math.round(videoWaitMs(req.durationSec) / 1000)} giây.${why}`);
  }
}

export function createMuseProvider(cfg: AppConfig, pool: AccountPool = createAccountPool(cfg.profilesDir)): VideoProvider {
  return {
    id: "muse",
    async generateVideo(req, ctx) {
      assertMuseAllowed(cfg);
      const acc = pool.acquire();
      try {
        const result = await generateOnAccount(cfg, acc, req, ctx);
        pool.release(acc.id, "ok");
        return result;
      } catch (err) {
        pool.release(acc.id, err instanceof ProviderError && err.code === "SESSION_EXPIRED" ? "needs_login" : "cooldown");
        if (err instanceof ProviderError) throw err;
        const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
        throw new ProviderError("BROWSER_ERROR", `Lỗi khi điều khiển Muse bằng hồ sơ ${acc.id}: ${msg}`, { cause: err });
      }
    },
  };
}
