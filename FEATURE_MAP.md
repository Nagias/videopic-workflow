# FEATURE_MAP — bản đồ tính năng VideoPic Workflow

Tra file này **trước** khi làm, tái hiện lỗi hay kiểm chứng bất kỳ tính năng nào (`CLAUDE.md` mục 2.3). Không đoán đường: tính năng cần tìm không có ở đây thì tìm trong code rồi bổ sung vào file này trong cùng nhánh.

Quy ước ghi:
- Phần tử giao diện ghi bằng `data-testid` (ví dụ `[data-testid=run-button]`); e2e và người kiểm chứng đều bấm theo đúng tên này.
- Endpoint ghi "phương thức + đường dẫn" đúng như trong `src/features/*/routes.ts`. Test `tests/architecture.test.ts` kiểm mọi endpoint trong code đều có mặt ở đây.
- Hàm ghi kèm `()`, không ghi số dòng.
- Cột "Tốn": **Muse** (tài khoản Muse thật, mất lượt), **ffmpeg** (CPU), **—** (không tốn gì).

---

## 0. Điều kiện ban đầu

| Cần có | Để làm gì | Kiểm tra | Thiếu thì sao |
|---|---|---|---|
| Node ≥ 24, `npm ci` | chạy app, test | `npm run verify` | không chạy được |
| ffmpeg/ffprobe trong PATH | dịch vụ giả tạo clip, kiểm clip Muse | `ffmpeg -version` | node Tạo video báo "Không chạy được ffmpeg" |
| Google Chrome đã cài | Muse provider điều khiển Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` | Muse không chạy được |
| Hồ sơ Muse đã đăng nhập `.data/chrome_profiles/muse_vid_0N` | tạo video bằng Muse | `npm run smoke:muse` | node báo "Chưa có tài khoản Muse nào đã đăng nhập" |

## 1. Mở app, server thử

| Việc | Cách |
|---|---|
| Chạy app (dữ liệu thật `.data/`) | `npm run dev` → giao diện `http://127.0.0.1:5190`, API `http://127.0.0.1:8787` (`src/server.ts`). Cổng 5173 KHÔNG dùng vì dự án khác trên máy đã chiếm |
| Server thử cho e2e (dữ liệu riêng `.data-test/e2e-*`, `APP_ENV=test`, Muse bị chặn) | `npm run test:e2e` tự bật API 8797 + giao diện 5197 (`playwright.config.ts`) |
| Đăng nhập tài khoản Muse | `npm run muse:login -- muse_vid_0N` (`scripts/muse-login.ts`) |
| Thử Muse thật 1 clip, không qua giao diện | `npm run smoke:muse -- "<prompt>"` (`scripts/smoke-muse.ts`) — **Muse** |

## 2. Luồng 1 — Bộ khung đi được: Prompt → Tạo video → xem clip

Tính năng mẫu (khuôn cho mọi tính năng sau). Kế hoạch: `docs/superpowers/plans/2026-10-27-khung-di-duoc.md`.

### 2.1 Người dùng làm gì → hệ thống làm gì

| Bước | Thao tác (phần tử) | Phía giao diện | API | Phía máy chủ | Tốn |
|---|---|---|---|---|---|
| 1 | Mở app | `Editor()` gọi `api.getDefaultWorkflow()` | `GET /api/workflows/default` | `registerWorkflowRoutes()`: chưa có thì tạo từ `DEFAULT_GRAPH` | — |
| 2 | Gõ prompt `[data-testid=prompt-text-<id>]` | `PromptView()` → `editor.setParams()`; tự lưu sau 0,6 giây, trạng thái `[data-testid=save-status]` | `PUT /api/workflows/:id` | kiểm `SaveWorkflowBodySchema`, ghi bảng `workflows` | — |
| 3 | Chọn dịch vụ `[data-testid=provider-select-<id>]`, thời lượng `[data-testid=duration-select-<id>]` | `GenerateVideoView()` | như bước 2 | — | — |
| 4 | Bấm `[data-testid=run-button]` | `runNow()`: lưu ngay, rồi xin chạy | `POST /api/workflows/:id/runs` | `queue.enqueue()` ghi bảng `runs` trạng thái `queued`, trả 202 | — |
| 5 | Chờ; trạng thái chung `[data-testid=run-status]`, từng node `[data-testid=node-status-<id>]`, tiến độ `[data-testid=node-message-<id>]` | hỏi lại mỗi 1 giây (nợ N-001) | `GET /api/runs/:id` | worker `createQueue().processNext()` → `executeRun()`: `planGraph()` kiểm đồ thị → chạy theo thứ tự → `cacheKeyOf()` → có cache thì `cached`, không thì `run()` của node | **Muse** nếu dịch vụ là Muse; **ffmpeg** nếu dịch vụ giả |
| 6 | Xem clip `[data-testid=video-preview-<id>]` | `<video src=mediaUrl(id)>` | `GET /api/media/:id` (hỗ trợ tua, trả 206) | `reply.sendFile()` từ `.data/media` | — |
| 7 | Lỗi | thanh `[data-testid=problem-banner]` + `[data-testid=node-error-<id>]` | — | lỗi tiếng Việt từ `planGraph()` / provider | — |
| — | Thêm node `[data-testid=add-node-<loại>]` | `addNode()` | — | — | — |
| — | Xem tài khoản Muse `[data-testid=muse-accounts]` | khi mở app | `GET /api/muse/accounts` | `musePool.snapshot()` | — |

### 2.2 Bên trong node Tạo video khi chọn Muse (`src/providers/muse/index.ts`)

1. `assertMuseAllowed()`: test mà không có `MUSE_LIVE=1` thì dừng tại đây.
2. `createAccountPool().acquire()`: chọn hồ sơ `.data/chrome_profiles/muse_vid_0N` đã đăng nhập (`isProfileLoggedIn()`), xoay vòng, bỏ qua hồ sơ bận/nghỉ.
3. `launchProfile()`: Chrome đã cài, hồ sơ riêng, mặc định chạy ẩn (`MUSE_HEADLESS=0` để xem).
4. Vào muse.ai → tìm ô chat (`CHAT_INPUT_SELECTORS`); không thấy mà thấy nút đăng nhập → lỗi `SESSION_EXPIRED`, hồ sơ nghỉ 10 phút.
5. Mở chat mới (`NEW_CHAT_SELECTORS`), đánh dấu media cũ (`MARK_EXISTING_MEDIA_JS`), gửi prompt theo khuôn `formatVideoPrompt()`.
6. Quét 3 giây/lần tìm video MỚI (`FIND_NEW_VIDEO_JS` + bắt luồng mạng `video/mp4`), thấy ổn định 2 lần mới tải.
7. Loại video trùng sha256 đã có trong bảng `media` (video cũ của chat) và video sai (`validateVideoProbe()`: < 3 giây, > 2×yêu cầu+0,5 giây, nhỏ, dọc/vuông).
8. `storage.importFile()` → `.data/media/YYYY-MM/<id>.mp4`. Hết 300 giây (5s) / 420 giây (10s) không có video hợp lệ → lỗi `NO_MEDIA` kèm lý do từng video bị loại.

### 2.3 Kiểm chứng tự động của luồng này

| Lệnh | Kiểm gì |
|---|---|
| `npx vitest run src/core` | config, ffmpeg tạo/đọc clip thật, storage theo sha256, `planGraph()` (vòng lặp, nối sai kiểu, thiếu dây, tham số sai), cache: chạy lại không gọi dịch vụ |
| `npx vitest run src/providers` | khuôn prompt Muse, kiểm clip, xoay vòng hồ sơ, chặn Muse trong test |
| `npx vitest run tests/api.test.ts` | API lưu → chạy → xem clip (206), lỗi 400/404, chạy tiếp sau khi tắt máy giữa chừng |
| `npx vitest run tests/local-only.test.ts` | trang web lạ không bấm Chạy hộ được (403) |
| `npm run test:e2e` | Playwright bấm thật: gõ prompt → Chạy → clip 5 giây 1280×720 trong node → Chạy lại = "Dùng lại kết quả"; prompt trống; chọn Muse khi chưa đăng nhập |
| `npm run smoke:muse` | **Muse** thật, 1 clip 5 giây (chạy tay) |
