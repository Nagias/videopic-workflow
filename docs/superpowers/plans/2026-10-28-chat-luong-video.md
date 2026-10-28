# Nâng chất lượng video — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chủ dự án giao làm liền một mạch, 28/10/2026). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ảnh mẫu dùng chung (nhân vật, bối cảnh, đồ vật + trạng thái), cảnh viết theo khung đầu/chuyển động/đồ vật có luật liên tục, prompt Muse mới chống "nhựa", ghép một lần nén, node Biên kịch dùng chat Muse.

**Architecture:** Dữ liệu và luật nằm ở `src/shared/` (zod, chạy cả hai phía); prompt gom một file `src/shared/prompts.ts`; node mới sinh bằng `npm run new:node`; kho tài sản là bảng `assets` ghi duy nhất ở `src/features/assets/store.ts`, executor gọi khi node có `definition.library`.

**Tech Stack:** TypeScript 6, zod 4, Fastify 5, Drizzle + better-sqlite3, React 19 + React Flow, Playwright, Vitest, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-10-28-chat-luong-video-design.md`

## Global Constraints
- Prompt Muse tiếng Việt, gửi nguyên văn (`verbatim: true`); không chứa "cinematic", "photorealistic", "2K".
- Video prompt luôn có: "không nhìn vào máy quay", "không thêm người", "không cắt cảnh", "khung ngang 16:9".
- Tông ảnh mặc định: "Ảnh chụp bằng điện thoại như khung hình vlog, ánh sáng tự nhiên, trời hơi âm u, màu tự nhiên không chỉnh màu".
- Clip 5 giây; nối tối đa 2 cảnh liền; ảnh tham chiếu mỗi ảnh khung tối đa 3.
- Mã hoá ghép: `-preset medium -crf 17`, một lần duy nhất.
- Workflow cũ (Shot có `action`, Dựng phim không nối Đồ vật, Hồ sơ không có `name`) vẫn parse và chạy.

## Review Focus
1. Workflow Sơn La cũ trong `.data/app.db` (Shot dạng `action`) mở ra và chạy được — test parse dữ liệu cũ (Task 1) + test Dựng phim với cảnh cũ (Task 5).
2. Biên kịch: Muse trả chữ có thêm lời dẫn quanh JSON, hoặc JSON sai luật → lấy đúng khối JSON, gửi lỗi sửa trong cùng chat, quá 2 lần thì lỗi rõ (Task 8).
3. Chọn tài sản từ kho → không gọi dịch vụ lần nào (Task 6).
4. Đồ vật trong cảnh viết sai tên/trạng thái so với node Đồ vật → lỗi trước khi tốn lượt (Task 5).
5. Câu trả lời chữ của Muse đang gõ dở (chưa đứng yên) không bị đọc sớm (Task 7, trang Muse giả trả chữ theo từng đợt).

---

### Task 1: Dữ liệu + luật đạo diễn v2
**Files:** `src/shared/director.ts`, `src/shared/ports.ts`, `src/shared/node-definition.ts`, `src/core/executor.ts` (planGraph), test `src/nodes/shotlist/node.test.ts`, `src/core/executor.test.ts`.
**Produces:**
- `ShotSchema` (zod preprocess `action` → `start`,`motion`): `{ id, size, angle, move, subject: "character"|"hands"|"none", link, start: string, motion: string, props: string }`.
- `parsePropLines(text: string): { items: { name: string; from: string; to?: string }[]; errors: string[] }` — dòng `tên: a -> b` hoặc `tên: a`; dòng trống bỏ qua.
- `checkShotList(shots: Shot[], known?: { name: string; states: string[] }[]): ShotListCheck`.
- Cổng `props` (`PropSetValue`), `propspec` (`PropSpecValue`), `imageset.look?`, `imageset.role` thêm `"prop"` không cần; `PortDef.optional?: boolean`.
- [ ] Test: legacy `{action:"x"}` parse ra `start==motion=="x"` + cảnh báo "giống hệt"; thiếu motion → lỗi; cảnh cắt thiếu start → lỗi; nối thiếu start → hợp lệ.
- [ ] Test: `khúc gỗ: nguyên khúc -> bổ đôi` ở cảnh 1 rồi `khúc gỗ: nguyên khúc` ở cảnh 3 → lỗi "đang ở trạng thái 'bổ đôi'"; đổi trạng thái với `subject:"none"` → lỗi "không có người tác động"; tên lạ khi có `known` → lỗi; dòng thiếu dấu `:` → lỗi chỉ số dòng.
- [ ] Test executor: cổng `optional` chưa nối → không lỗi, node nhận thiếu input.
- [ ] Làm, chạy `npx vitest run src/nodes/shotlist src/core`, commit.

### Task 2: Prompt mới + Muse/giả nhận `verbatim`, `session` cho video
**Files:** create `src/shared/prompts.ts`; modify `src/providers/types.ts`, `src/providers/muse/index.ts`, `src/providers/muse/prompt.ts`, `src/providers/fake/index.ts`, `tests/helpers/nodes.ts`; test `src/shared/prompts.test.ts`, `src/providers/muse/muse.test.ts`.
**Produces:** `DEFAULT_LOOK`; `keyframePrompt(shot, ctx: { look; location; props: {name;state;description}[]; inChat: boolean; character?: string })`; `textVideoPrompt(shot, ctx: { look; location })`; `motionPrompt(shot)`; `CHARACTER_SHEET(desc)`, `LOCATION_SHEET(desc, look)`, `propStillPrompt(item, look)`, `propStatePrompt(item, state)` (mảng `ReferenceView`). `VideoRequest` + `session?`, `verbatim?`; `ImageRequest` + `verbatim?`. `formatVideoPrompt` bỏ "cinematic 24fps smooth pacing".
- [ ] Test: mọi prompt không chứa /cinematic|photorealistic|2K/i; video prompt chứa 4 câu bắt buộc (Global Constraints); `motionPrompt` không lặp lại `start`; cỡ cảnh/góc máy/chuyển động có nhãn tiếng Việt cho prompt (`SHOT_SIZES[k].vi`).
- [ ] Làm, test, commit.

### Task 3: Ghép một lần nén, bù sáng trong ghép
**Files:** `src/core/ffmpeg.ts`, `src/core/ffmpeg.test.ts`.
**Produces:** `ConcatPart` + `brightness?: { startLuma: number; endLuma: number; clipSec: number }`; bỏ `stabilizeBrightness`; `ENCODE_V` dùng `-preset medium -crf 17`.
- [ ] Test: ghép 2 clip, clip 1 có `brightness` chênh 40 → độ sáng cuối clip 1 trong phim gần độ sáng đầu (sai ≤ 6); không còn file trung gian.
- [ ] Làm, test, commit.

### Task 4: Ảnh mẫu — nhân vật 4 ảnh, bối cảnh có tông ảnh, node Đồ vật
**Files:** `src/core/reference-set.ts`, `src/nodes/character/*`, `src/nodes/location/*`, `npm run new:node props` → `src/nodes/props/*`, `src/features/editor/ui/widgets.tsx` (nhãn góc).
**Produces:** Character params `{ name?, description, provider }`, views `face, front, side, back`; Location params `{ name?, description, look, provider }` → `imageset.look`; Props params `{ name?, items: {name, description, states: string}[], provider }` (states phân tách bằng dấu phẩy, phần tử đầu = trạng thái gốc), cổng vào `spec: propspec` (optional), ra `props: props`.
- [ ] Test character: 4 ảnh, phiên `new, continue×3`; location: `look` mặc định khi để trống; props: món 2 trạng thái = 2 ảnh, ảnh 2 trong cùng chat; 2 món chạy song song; có `spec` thì bỏ `items`.
- [ ] Làm, test, commit.

### Task 5: Dựng phim v2
**Files:** `src/nodes/film/{definition,run,view}.tsx?`, `src/nodes/film/node.test.ts`.
**Consumes:** Task 1–4. Input `props` optional.
- [ ] Test đường đi: cảnh không người không đồ vật → 0 ảnh, video không `firstFrame`; có nhân vật → ảnh trong chat nhân vật, đính kèm bối cảnh + đồ vật đúng trạng thái đầu (≤3); không người có đồ vật → ảnh mới có đính kèm; nối → khung cuối; tên đồ vật sai → lỗi trước khi gọi dịch vụ (0 lượt); cảnh cũ dạng `action` vẫn ra phim; bù sáng không tạo media `brightness-fix`.
- [ ] Làm, test, commit.

### Task 6: Kho tài sản dùng chung
**Files:** `src/core/db/schema.ts` + `npm run db:generate`; create `src/features/assets/{store,routes}.ts`; `src/core/executor.ts` (gọi `recordAsset`); `src/shared/node-definition.ts` (`library?: "character"|"location"|"props"`); `src/shared/api.ts`, `src/app/api-client.ts`; widget `AssetPicker` trong `widgets.tsx`; 3 view; `src/app-server.ts` đăng ký route; test `tests/api.test.ts`.
**Produces:** `GET /api/assets?kind=` → `{ assets: { id, kind, name, params, thumbnailMediaId?, updatedAt }[] }`; `data-testid=asset-pick-<id>`.
- [ ] Test API: chạy workflow có nhân vật → kho có 1 mục; tạo workflow khác, đặt params từ kho, chạy → dịch vụ không bị gọi.
- [ ] Làm, test, commit.

### Task 7: Muse đọc câu trả lời chữ
**Files:** `src/providers/types.ts` (`generateText(req: { prompt: string; session?: ChatSessionRef }, ctx): Promise<{ text: string; session: ChatSessionRef }>`), `src/providers/muse/index.ts` (job kind `"text"`: chờ chữ sau prompt đứng yên 3 lần quét liên tiếp và ≥ 20 ký tự, hết 180 giây → `NO_TEXT`; vẫn bắt `MUSE_FAILED`), `src/providers/fake/index.ts`, `e2e/muse-driver.spec.ts` (trang giả trả chữ theo 3 đợt).
- [ ] Test e2e trang giả: nhận đủ chữ đợt cuối, không nhận đợt 1.
- [ ] Làm, test, commit.

### Task 8: Node Biên kịch
**Files:** `npm run new:node writer` → `src/nodes/writer/*`; prompt `writerPrompt(idea, count)` + `repairPrompt(errors)` trong `src/shared/prompts.ts`; `extractJsonBlock(text): unknown` trong `src/shared/writer-format.ts` (+ zod `WriterOutputSchema`); fake `generateText` trả JSON hợp lệ dựng từ ý tưởng.
**Produces:** params `{ idea: string (≥20), shotCount: 4..24, provider }`; ra `shots: shotlist`, `props: propspec`.
- [ ] Test: chữ có lời dẫn + ```json → đọc được; JSON sai luật lần 1 → gửi `repairPrompt` cùng session → lần 2 đúng → xong (2 lượt); sai 3 lần → lỗi "Biên kịch chưa ra danh sách cảnh hợp lệ sau 3 lần" kèm lỗi cuối.
- [ ] Làm, test, commit.

### Task 9: Mẫu, giao diện, tài liệu, e2e
**Files:** `src/shared/templates.ts` (Sơn La v2 + "y-tuong-thanh-phim"), view Danh sách cảnh (khung đầu, chuyển động, đồ vật, chủ thể "Chỉ thấy tay"), `e2e/chuoi-canh.spec.ts`, e2e mới `e2e/bien-kich.spec.ts`, `FEATURE_MAP.md` luồng 3, `docs/ARCHITECTURE.md`, `NOTICE.md`, `DEBT.md`, xoá `scripts/spike-bo-cui.ts`.
- [ ] e2e: Sơn La v2 giả → nhân vật 4 ảnh, đồ vật đủ ảnh, 12 ô xong, phim ≥ 59 giây; mẫu ý tưởng → Biên kịch giả → phim; chọn nhân vật từ kho ở workflow thứ hai.
- [ ] `npm run verify:full` xanh, commit.

### Task 10: Muse thật + soát + PR
- [ ] Chạy mẫu Sơn La v2 bằng Muse thật qua giao diện; xem lưới khung từng cảnh; ghi lượt vào `TASKS.md`.
- [ ] Chạy Biên kịch Muse thật 1 lần với ý tưởng ngắn.
- [ ] Một lượt soát toàn nhánh (subagent), sửa, PR vào `main`.
