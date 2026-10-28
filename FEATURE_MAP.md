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
| — | Thêm node: ô chọn `[data-testid=add-node]` | `addNode()` | — | — | — |
| — | Xem tài khoản Muse `[data-testid=muse-accounts]` | khi mở app | `GET /api/muse/accounts` | `musePool.snapshot()` | — |

### 2.2 Bên trong node Tạo video khi chọn Muse (`src/providers/muse/index.ts`)

1. `assertMuseAllowed()`: test mà không có `MUSE_LIVE=1` thì dừng tại đây.
2. `createAccountPool().acquire()`: chọn hồ sơ `.data/chrome_profiles/muse_vid_0N` đã đăng nhập (`isProfileLoggedIn()`), xoay vòng, bỏ qua hồ sơ bận/nghỉ.
3. `launchProfile()`: Chrome đã cài, hồ sơ riêng, mặc định chạy ẩn (`MUSE_HEADLESS=0` để xem).
4. Vào muse.ai → tìm ô chat (`CHAT_INPUT_SELECTORS`); không thấy mà thấy nút đăng nhập → lỗi `SESSION_EXPIRED`, hồ sơ nghỉ 10 phút.
5. Mở đoạn chat phụ mới: thử `NEW_CHAT_SELECTORS`, không có thì mở menu Chats (`CHAT_SWITCHER_SELECTOR`) rồi bấm "New side chat" (`NEW_SIDE_CHAT_IN_MENU_SELECTORS`, giao diện đo 27/10/2026). Đánh dấu media cũ (`MARK_EXISTING_MEDIA_JS`), gửi prompt theo khuôn `formatVideoPrompt()`. Mọi đoạn JS chạy trong trang đi qua `callJs()` (nhúng tham số vào chuỗi; `page.evaluate` với chuỗi bỏ qua tham số — lỗi đã gặp).
6. Quét 3 giây/lần tìm video MỚI (`FIND_NEW_VIDEO_JS` + bắt luồng mạng `video/mp4`), thấy ổn định 2 lần mới tải.
7. Loại video trùng sha256 đã có trong bảng `media` (video cũ của chat) và video sai (`validateVideoProbe()`: < 3 giây, > 2×yêu cầu+0,5 giây, nhỏ, dọc/vuông).
8. `storage.importFile()` → `.data/media/YYYY-MM/<id>.mp4`. Hết 300 giây (5s) / 420 giây (10s) không có video hợp lệ → lỗi `NO_MEDIA` kèm lý do từng video bị loại.
9. Lỗi bất kỳ: `captureDebug()` lưu ảnh + HTML trang Muse vào `.data/debug/muse-<hồ sơ>-<giờ>.png|.html`, đường dẫn ảnh nằm cuối thông báo lỗi trên node. Số đo thật 27/10/2026: một clip 5 giây mất ~104 giây từ lúc bấm Chạy.

### 2.3 Kiểm chứng tự động của luồng này

| Lệnh | Kiểm gì |
|---|---|
| `npx vitest run src/core` | config, ffmpeg tạo/đọc clip thật, storage theo sha256, `planGraph()` (vòng lặp, nối sai kiểu, thiếu dây, tham số sai), cache: chạy lại không gọi dịch vụ |
| `npx vitest run src/providers` | khuôn prompt Muse, kiểm clip, xoay vòng hồ sơ, chặn Muse trong test |
| `npx vitest run tests/api.test.ts` | API lưu → chạy → xem clip (206), lỗi 400/404, chạy tiếp sau khi tắt máy giữa chừng |
| `npx vitest run tests/local-only.test.ts` | trang web lạ không bấm Chạy hộ được (403) |
| `npm run test:e2e` | Playwright bấm thật: gõ prompt → Chạy → clip 5 giây 1280×720 trong node → Chạy lại = "Dùng lại kết quả"; prompt trống; chọn Muse khi chưa đăng nhập. Thêm `e2e/muse-driver.spec.ts`: Muse provider chạy trên **trang Muse giả** (menu Chats → New side chat, video cũ vẽ lại dưới link mới) — không tốn lượt |
| `npm run smoke:muse` | **Muse** thật, 1 clip 5 giây (chạy tay) |

## 3. Luồng 2 — Video ~1 phút từ chuỗi cảnh (mẫu "Sinh tồn Sơn La")

Kế hoạch: `docs/superpowers/plans/2026-10-27-video-chuoi-canh.md`. Chủ dự án chọn: chạy thẳng, không dừng duyệt; gương mặt AI giống người thật, nét phổ thông Việt Nam, mộc mạc.

### 3.1 Người dùng làm gì → hệ thống làm gì

| Bước | Thao tác (phần tử) | Phía giao diện | API | Phía máy chủ | Tốn |
|---|---|---|---|---|---|
| 1 | Bấm `[data-testid=template-<mẫu>]` | `switchTo()` lưu workflow đang mở, rồi tạo từ mẫu | `POST /api/workflows/from-template/:templateId` | lấy `WORKFLOW_TEMPLATES` (`src/shared/templates.ts`), tạo workflow mới | — |
| 2 | Chọn workflow khác `[data-testid=workflow-select]` | `showWorkflow()`; nhớ trong URL `?wf=` | `GET /api/workflows`, `GET /api/workflows/:id` | — | — |
| 3 | Sửa mô tả nhân vật `[data-testid=character-text-<id>]`, bối cảnh `[data-testid=location-text-<id>]`, dịch vụ `[data-testid=provider-select-<id>]` | tự lưu | `PUT /api/workflows/:id` | — | — |
| 4 | Sửa cảnh trong `[data-testid=shotlist-<id>]` (từng dòng `[data-testid=shot-row-<id>-<n>]`, thêm `[data-testid=add-shot-<id>]`) | `ShotListView()`: báo lỗi/cảnh báo ngay theo `checkShotList()` | như bước 3 | — | — |
| 5 | Bấm `[data-testid=run-button]` | như luồng 1 | như luồng 1 | `executeRun()`: Hồ sơ nhân vật → Hồ sơ không gian → Danh sách cảnh → Dựng phim | **Muse**: 3 + 2 ảnh hồ sơ, 1 ảnh khung mỗi cảnh "cắt", 1 clip mỗi cảnh; **ffmpeg** |
| 6 | Xem ảnh hồ sơ `[data-testid=gallery-<id>]`, storyboard `[data-testid=storyboard-<id>]` (ô `[data-testid=shot-<id>-<n>]`), phim `[data-testid=video-preview-<id>]` | hiện dần trong lúc chạy (`ctx.partial()` ghi kết quả từng phần) | `GET /api/runs/:id`, `GET /api/media/:id` | — | — |

### 3.2 Bên trong

- **Hồ sơ nhân vật** `src/nodes/character/`: `generateReferenceSet(..., "chat")` (`src/core/reference-set.ts`) — ảnh chính diện mở **chat phụ mới**, các góc sau tạo **nối tiếp trong chat đó** (`inChatPrompt`, không tải ảnh người lên); kết quả giữ `session` (tài khoản + đường dẫn chat phụ) để node Dựng phim dùng tiếp. Hỏng thì mở chat phụ mới, đính kèm ảnh chính diện (`fallback`). Góc: `CHARACTER_VIEWS`.
- **Hồ sơ không gian** `src/nodes/location/`: `generateReferenceSet(..., "attach")` — ảnh không người, các ảnh sau đính kèm ảnh đầu. Góc: `LOCATION_VIEWS`.
- **Danh sách cảnh** `src/nodes/shotlist/`: dữ liệu đạo diễn `src/shared/director.ts` — `SHOT_SIZES`, `CAMERA_ANGLES`, `CAMERA_MOVES`; `checkShotList()` chặn cảnh đầu "nối", nối khác chủ thể, nối liền quá `MAX_CHAIN_RUN` (2); cảnh báo luật 30°.
- **Dựng phim** `src/nodes/film/run.ts`:
  1. Mỗi cảnh: "cắt" có nhân vật → `characterKeyframe()`: ảnh khung tạo **lần lượt trong chat phụ của nhân vật** (khoá `characterChat`, prompt `composeInChatKeyframePrompt()`, đính kèm ảnh toàn cảnh không người); hỏng → chat phụ mới với `referencesFor()` + `composeKeyframePrompt()`. "Cắt" cảnh phụ → `composeKeyframePrompt()` + 2 ảnh bối cảnh. "Nối" → khung cuối clip trước (`lastFrameOf()`, lùi `LAST_FRAME_FROM_END_SEC`).
  2. Clip `SHOT_SECONDS` (5) giây từ ảnh khung, prompt `composeMotionPrompt()`.
  3. Bù sáng `fixBrightness()` (đo độ sáng đầu/cuối, `stabilizeBrightness()`).
  4. Ghép `concatClips()`: chuẩn 1280×720 24 fps, cắt `CHAIN_TRIM_SEC` ở đầu cảnh nối, làm mềm tiếng ở mối nối.
  - Song song theo `provider.maxParallel()` (Muse = số hồ sơ đã đăng nhập); cảnh nối chờ cảnh trước.
  - Mỗi bước con qua `ctx.step()` (cache theo khoá băm): sửa một cảnh chỉ chạy lại cảnh đó; cảnh lỗi không làm mất cảnh đã xong.
- **Muse** thêm `generateImage()`: đính kèm từng ảnh (`attachFile()`), chú thích vai trò ảnh trong prompt (`formatImagePrompt()`), loại ảnh trùng ảnh đính kèm bằng dấu vân tay (`averageHash()`), chuẩn hoá 1280×720 (`normalizeImage()`); bắt từ chối (`findRefusal()`, `REFUSED`) và báo lỗi của Muse (`findMuseFailure()`, `MUSE_FAILED`) chỉ trong câu trả lời sau prompt (`replyAfterPrompt()`); chờ hồ sơ rảnh (`acquireWait()`, `acquireSpecific()` cho chat của nhân vật).
- **Luôn dùng chat phụ** (chủ dự án yêu cầu 27/10/2026): `openSideChat()` — nút `hatch-chat-compose` ("+" cạnh "Side chats") hoặc chữ "New side chat" trong menu Chats; không mở được → `SIDE_CHAT_FAILED`, **không** gửi vào chat chính. Đường dẫn chat lấy bằng `waitThreadUrl()` (`isSideChatThread()`).
- **Chat phụ không tạo được → mở chat phụ mới thử lại** (`runJob()`, `MAX_JOB_ATTEMPTS` = 2, các mã trong `RETRY_IN_NEW_SIDE_CHAT`).

### 3.3 Kiểm chứng tự động

| Lệnh | Kiểm gì |
|---|---|
| `npx vitest run src/nodes` | 4 node mới: hồ sơ 3/2 ảnh, luật đạo diễn, Dựng phim 4 cảnh (nối dùng khung cuối thật, ra ~20 giây), cảnh lỗi → cảnh nối bị bỏ qua → chạy lại chỉ làm phần lỗi |
| `npx vitest run src/core/ffmpeg.test.ts` | ảnh→clip, khung cuối, chuẩn hoá ảnh dọc, bù sáng, ghép clip 10 giây cắt về 5, clip không tiếng |
| `npx playwright test e2e/muse-driver.spec.ts` | trang Muse giả: tạo ảnh có đính kèm (không nhận nhầm ảnh mình gửi), Muse từ chối → `REFUSED` |
| `npx playwright test e2e/chuoi-canh.spec.ts` | bấm thật: tạo từ mẫu → đổi sang dịch vụ giả → Chạy → storyboard 12 ô "xong" → phim ~60 giây |

## 4. Luồng 3 — Ảnh mẫu dùng chung, phân cảnh khung đầu/chuyển động, Biên kịch Muse (28/10/2026)

Thiết kế: `docs/superpowers/specs/2026-10-28-chat-luong-video-design.md`. Kế hoạch: `docs/superpowers/plans/2026-10-28-chat-luong-video.md`.

### 4.1 Người dùng làm gì → hệ thống làm gì

| Bước | Thao tác (phần tử) | Phía giao diện | API | Phía máy chủ | Tốn |
|---|---|---|---|---|---|
| 1 | Chọn ảnh mẫu đã tạo `[data-testid=asset-pick-<id>]` (node Nhân vật, Không gian, Đồ vật) | `AssetPicker()` điền lại tham số (Đồ vật: thêm món) | `GET /api/assets` (tham số `?kind=character|location|props`) | `listAssets()` (`src/features/assets/store.ts`) | — |
| 2 | Đặt tên ảnh mẫu `[data-testid=asset-name-<id>]` | tự lưu | `PUT /api/workflows/:id` | executor gọi `recordAsset()` khi node có `definition.library` chạy xong hoặc lấy cache | — |
