import path from "node:path";
import { loadConfig } from "../src/core/config";
import { PROFILE_NAME_RE } from "../src/providers/muse/accounts";
import { launchProfile } from "../src/providers/muse/browser";

const name = process.argv[2] ?? "";
if (!PROFILE_NAME_RE.test(name)) {
  console.error('Cách dùng: npm run muse:login -- muse_vid_01   (tên hồ sơ dạng muse_vid_NN)');
  process.exit(1);
}

const cfg = loadConfig();
const profileDir = path.join(cfg.profilesDir, name);
console.log(`Mở Chrome hồ sơ ${name} (${profileDir}). Đăng nhập Muse, xong thì đóng cửa sổ Chrome.`);
const context = await launchProfile(profileDir, false);
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(cfg.museUrl);
await new Promise<void>((resolve) => context.on("close", () => resolve()));
console.log(`Đã đóng. Phiên đăng nhập của ${name} được lưu trong hồ sơ.`);
