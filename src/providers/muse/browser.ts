import { chromium, type BrowserContext } from "playwright";

const CHROME_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-infobars",
  "--disable-dev-shm-usage",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--window-size=1280,800",
  "--lang=vi-VN,vi,en-US,en",
];

const STEALTH_INIT_SCRIPT = `
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
window.chrome = window.chrome || { runtime: {} };
`;

export async function launchProfile(profileDir: string, headless: boolean): Promise<BrowserContext> {
  try {
    const context = await chromium.launchPersistentContext(profileDir, {
      channel: "chrome",
      headless,
      args: CHROME_ARGS,
      ignoreDefaultArgs: ["--enable-automation"],
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    });
    await context.addInitScript(STEALTH_INIT_SCRIPT);
    return context;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/user data directory is already in use|ProcessSingleton|lock/i.test(msg)) {
      throw new Error(`Hồ sơ Chrome ${profileDir} đang mở ở một cửa sổ khác. Đóng cửa sổ Chrome đó rồi chạy lại.`, { cause: err });
    }
    throw new Error(`Không mở được Chrome cho hồ sơ ${profileDir}: ${msg.split("\n")[0]}`, { cause: err });
  }
}
