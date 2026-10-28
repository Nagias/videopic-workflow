import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../src/core/config";
import { openDb } from "../src/core/db/client";
import { createFfmpeg } from "../src/core/ffmpeg";
import { createStorage } from "../src/core/storage";
import { createAccountPool } from "../src/providers/muse/accounts";
import { createMuseProvider } from "../src/providers/muse";
import type { ChatSessionRef, ProviderContext } from "../src/providers/types";

// Thử nghiệm bỏ đi (nhánh thu-nghiem-prompt-muse): cùng cảnh bổ củi, 5 cách tạo khác nhau.

const CHARACTER_CHAT: ChatSessionRef = { accountId: "muse_vid_01", threadUrl: "https://muse.ai/thread/a99abcdb-9472-4e0d-ac68-983676b52265" };
const OLD_KEYFRAME = "cab0d1db-df40-41b5-8a74-9766db4adb55";

const LOOK = "Quay như vlog sinh tồn bằng điện thoại cầm tay, ánh sáng tự nhiên, trời hơi âm u, màu tự nhiên không chỉnh màu, khung ngang 16:9";
const CHOP = "giơ rìu bổ mạnh xuống giữa khúc gỗ ngắn đang dựng trên gốc cây, lưỡi rìu cắm vào gỗ, khúc gỗ tách làm đôi đổ sang hai bên, vụn gỗ văng ra";

const V1 = `Tạo video 5 giây: một cô gái Việt Nam khoảng 20 tuổi, buộc tóc đuôi ngựa, mặc áo bra thể thao màu than, quần legging xanh ô liu, đứng cạnh chiếc lều xanh trong rừng, ${CHOP}. ${LOOK}.`;
const V2 = `Tạo video 5 giây: chính cô gái trong các ảnh bạn đã tạo ở trên (giữ nguyên mặt, tóc, quần áo) đứng cạnh chiếc lều xanh, ${CHOP}. ${LOOK}.`;
const MOTION_AFTER = `Tạo video 5 giây từ ảnh đính kèm, giữ nguyên người, rìu, khúc gỗ và bối cảnh trong ảnh: cô gái bổ mạnh rìu xuống giữa khúc gỗ, lưỡi rìu cắm vào gỗ, khúc gỗ tách đôi đổ sang hai bên, vụn gỗ văng ra. Chuyển động thật, có lực, máy quay cầm tay hơi rung. Không thêm người, không cắt cảnh, khung ngang 16:9.`;
const V3_IMAGE = `Tạo 1 ảnh khung ngang 16:9: chính cô gái trong các ảnh ở trên (giữ nguyên mặt, tóc, quần áo) đứng cạnh chiếc lều xanh trong rừng, hai tay giơ cao chiếc rìu nhỏ, ngay trước mặt cô là một khúc gỗ ngắn dựng đứng trên một gốc cây cưa phẳng. Ảnh chụp bằng điện thoại như một khung hình vlog, trời hơi âm u, màu tự nhiên không chỉnh màu, bối cảnh đơn giản, không chữ.`;
const V4 = `Tạo video 5 giây, cận cảnh: lưỡi rìu bổ mạnh từ trên xuống giữa một khúc gỗ ngắn đặt trên gốc cây, khúc gỗ tách làm đôi đổ sang hai bên, vụn gỗ văng ra. Chỉ thấy bàn tay và lưỡi rìu. ${LOOK}.`;

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const storage = createStorage(cfg, db);
const ffmpeg = createFfmpeg(cfg);
const pool = createAccountPool(cfg.profilesDir);
console.log("Hồ sơ Muse:", pool.snapshot());
const muse = createMuseProvider(cfg, pool);
const outDir = path.join(cfg.dataDir, "exports", "thu-nghiem-bo-cui");
await mkdir(outDir, { recursive: true });

const ctxFor = (tag: string): ProviderContext => ({
  signal: new AbortController().signal,
  report: (m) => console.log(`[${tag}] ${m}`),
  storage,
  ffmpeg,
});

type Outcome = { tag: string; ok: boolean; seconds: number; mediaId?: string; file?: string; error?: string };
const outcomes: Outcome[] = [];

async function attempt(tag: string, fn: () => Promise<string>): Promise<string | undefined> {
  const t0 = Date.now();
  try {
    const mediaId = await fn();
    const rec = storage.getMedia(mediaId)!;
    const file = path.join(outDir, `${tag}${path.extname(rec.relPath)}`);
    await copyFile(storage.absPath(rec), file);
    outcomes.push({ tag, ok: true, seconds: Math.round((Date.now() - t0) / 1000), mediaId, file });
    console.log(`[${tag}] XONG → ${file}`);
    return mediaId;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    outcomes.push({ tag, ok: false, seconds: Math.round((Date.now() - t0) / 1000), error });
    console.log(`[${tag}] LỖI: ${error}`);
    return undefined;
  }
}

const video = (tag: string, prompt: string, extra: { session?: ChatSessionRef; firstFrameMediaId?: string } = {}) =>
  attempt(tag, async () => (await muse.generateVideo({ prompt, durationSec: 5, verbatim: true, ...extra }, ctxFor(tag))).mediaId);

await Promise.all([
  video("V1-chu-ra-video", V1),
  video("V3a-khung-cu-prompt-moi", MOTION_AFTER, { firstFrameMediaId: OLD_KEYFRAME }),
  video("V4-can-riu-bo-go", V4),
  (async () => {
    await video("V2-chu-ra-video-trong-chat-nhan-vat", V2, { session: CHARACTER_CHAT });
    const img = await attempt("V3-anh-khung-moi", async () =>
      (await muse.generateImage({ prompt: V3_IMAGE, references: [], session: CHARACTER_CHAT, verbatim: true }, ctxFor("V3-anh"))).mediaId,
    );
    if (img) await video("V3-khung-moi-prompt-moi", MOTION_AFTER, { firstFrameMediaId: img });
  })(),
]);

await writeFile(path.join(outDir, "ket-qua.json"), JSON.stringify({ prompts: { V1, V2, MOTION_AFTER, V3_IMAGE, V4 }, outcomes }, null, 2));
console.log(JSON.stringify(outcomes, null, 2));
db.$client.close();
