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
| 5 | Chờ; trạng thái chung `[data-testid=run-status]`, từng node `[data-testid=node-status-<id>]`, tiến độ `[data-testid=node-message-<id>]` | hỏi lại mỗi 1 giây (nợ N-001) | `GET /api/runs/:id` | worker `createQueue().processNext()` → `executeRun()`: `planGraph()` kiểm đồ thị → `scopeNodes()` lọc phạm vi (`runs.scope_json`) → node đủ nguồn chạy song song (giới hạn theo dịch vụ ở `ctx.shared.slot`), nguồn lỗi thì `skipped` → `cacheKeyOf()` → có cache thì `cached`, không thì `run()` của node | **Muse** nếu dịch vụ là Muse; **ffmpeg** nếu dịch vụ giả |
| 6 | Xem clip `[data-testid=video-preview-<id>]` | `<video src=mediaUrl(id)>` | `GET /api/media/:id` (hỗ trợ tua, trả 206) | `reply.sendFile()` từ `.data/media` | — |
| 7 | Lỗi | thanh `[data-testid=problem-banner]` + `[data-testid=node-error-<id>]` | — | lỗi tiếng Việt từ `planGraph()` / provider | — |
| — | Mở workflow (lúc tải trang hoặc đổi workflow) | `showWorkflow()` gọi `api.getLatestRun()`; có lần chạy thì hiện lại output từng node, `[data-testid=run-status]` ghi "Lần trước: …"; lần đó đang chạy dở thì tiếp tục hỏi tiến độ như bước 5 | `GET /api/workflows/:id/runs/latest` | `registerRunRoutes()`: lần chạy mới nhất theo `createdAt`, chưa chạy lần nào thì `{ run: null }` | — |
| — | Thêm node: ô chọn `[data-testid=add-node]` | `addNode()`: đặt giữa vùng đang nhìn (`placeNewNode()`), chọn sẵn, lấy dịch vụ của node đang có (`inheritProvider()`) — `src/features/editor/ui/new-node.ts` | — | — | — |
| — | Nối dây | `onConnect()`: cổng vào đã có dây thì thay dây cũ. Thả sai cổng → `onConnectEnd()` + `droppedConnectionProblem()` hiện lý do và chỗ cắm đúng (`acceptersOf()`) ở `[data-testid=problem-banner]`. Màu cổng/dây theo loại dữ liệu (`edgeKindClass()`, CSS `.kind-*`) — `src/features/editor/ui/graph-convert.ts` | — | — | — |
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
| `npx vitest run src/features/editor` | lý do nối sai và gợi ý chỗ cắm, màu dây, chỗ đặt node mới, dịch vụ node mới |
| `npx playwright test e2e/giao-dien-nhanh.spec.ts` | bấm thật: mở lại workflow đã chạy thấy clip cũ; kéo dây sai thấy lý do; cắm vào cổng đã có dây thì thay dây; node mới hiện giữa màn hình, cùng dịch vụ |
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

Từ 28/10/2026 phần bên trong luồng này đổi theo luồng 3 (mục 4.2): ảnh mẫu 4 góc, đồ vật, prompt mới, đường tạo cảnh, bù sáng trong lúc ghép. Các phần không đổi:

- **Danh sách cảnh** `src/nodes/shotlist/`: dữ liệu đạo diễn `src/shared/director.ts` — `SHOT_SIZES`, `CAMERA_ANGLES`, `CAMERA_MOVES`, `SUBJECTS`; `checkShotList()` chặn cảnh đầu "nối", nối khác chủ thể, nối liền quá `MAX_CHAIN_RUN` (2); cảnh báo luật 30°.
- **Dựng phim**: song song theo chỗ dịch vụ `ctx.shared.slot()` (`provider.maxParallel()`, Muse = số hồ sơ đã đăng nhập; chung cả lần chạy), cảnh nối chờ cảnh trước; mỗi bước con qua `ctx.step()` (cache theo khoá băm): sửa một cảnh chỉ chạy lại cảnh đó; cầu dao dừng khi dịch vụ lỗi `SERVICE_FAILURE_LIMIT` (3) lần.
- **Muse** `generateImage()`: đính kèm từng ảnh (`attachFile()`), chuẩn hoá 1280×720 (`normalizeImage()`); bắt từ chối (`findRefusal()`, `REFUSED`) và báo lỗi của Muse (`findMuseFailure()`, `MUSE_FAILED`) chỉ trong câu trả lời sau prompt; chờ hồ sơ rảnh (`acquireWait()`, `acquireSpecific()` cho chat của nhân vật).
- **Luôn dùng chat phụ** (chủ dự án yêu cầu 27/10/2026): `openSideChat()`; không mở được → `SIDE_CHAT_FAILED`, **không** gửi vào chat chính. Chat phụ hỏng → mở chat phụ mới thử lại (`runJob()`, `MAX_JOB_ATTEMPTS` = 2, các mã trong `RETRY_IN_NEW_SIDE_CHAT`).

### 3.3 Kiểm chứng tự động

| Lệnh | Kiểm gì |
|---|---|
| `npx vitest run src/nodes` | các node: hồ sơ 4/2 ảnh, đồ vật, luật đạo diễn, Biên kịch, Dựng phim (đường tạo cảnh, nối dùng khung cuối thật, ra ~20 giây), cảnh lỗi → cảnh nối bị bỏ qua → chạy lại chỉ làm phần lỗi |
| `npx vitest run src/core/ffmpeg.test.ts` | ảnh→clip, khung cuối, chuẩn hoá ảnh dọc, bù sáng ngay trong lúc ghép, ghép clip 10 giây cắt về 5, clip không tiếng |
| `npx playwright test e2e/muse-driver.spec.ts` | trang Muse giả: tạo ảnh có đính kèm (không nhận nhầm ảnh mình gửi), Muse từ chối → `REFUSED` |
| `npx playwright test e2e/chuoi-canh.spec.ts` | bấm thật: tạo từ mẫu → đổi sang dịch vụ giả → Chạy → nhân vật 4 ảnh, đồ vật 9 ảnh, storyboard 12 ô "xong" → phim ~60 giây |

## 4. Luồng 3 — Ảnh mẫu dùng chung, phân cảnh khung đầu/chuyển động, Biên kịch Muse (28/10/2026)

Thiết kế: `docs/superpowers/specs/2026-10-28-chat-luong-video-design.md`. Kế hoạch: `docs/superpowers/plans/2026-10-28-chat-luong-video.md`.

### 4.1 Người dùng làm gì → hệ thống làm gì

| Bước | Thao tác (phần tử) | Phía giao diện | API | Phía máy chủ | Tốn |
|---|---|---|---|---|---|
| 1 | Chọn ảnh mẫu đã tạo `[data-testid=asset-pick-<id>]` (node Nhân vật, Không gian, Đồ vật) | `AssetPicker()` điền lại tham số (Đồ vật: thêm món) | `GET /api/assets` (tham số `kind`: character, location hoặc props) | `listAssets()` (`src/features/assets/store.ts`) | — |
| 2 | Đặt tên ảnh mẫu `[data-testid=asset-name-<id>]` | tự lưu | `PUT /api/workflows/:id` | executor gọi `recordAsset()` khi node có `definition.library` chạy xong hoặc lấy cache | — |
| 3 | Gõ tông ảnh `[data-testid=location-look-<id>]` (node Không gian) | tự lưu | `PUT /api/workflows/:id` | `lookOf()` → câu tông ảnh gắn vào bộ ảnh (`imageset.look`), mọi prompt ảnh/video dùng | — |
| 4 | Gõ đồ vật: tên `[data-testid=prop-name-<id>-<n>]`, mô tả `[data-testid=prop-desc-<id>-<n>]`, trạng thái `[data-testid=prop-states-<id>-<n>]`, thêm `[data-testid=add-prop-<id>]`; xem ảnh `[data-testid=props-gallery-<id>]` | `PropsView()` | như bước 3 | node `props`: `checkSpec()`, mỗi món một chat phụ, ảnh tĩnh vật (`propStillPrompt()`) rồi từng trạng thái nối tiếp (`propStatePrompt()`) | **Muse**: 1 ảnh mỗi trạng thái mỗi món |
| 5 | Mỗi cảnh: khung đầu `[data-testid=shot-start-<id>-<n>]`, chuyển động `[data-testid=shot-motion-<id>-<n>]`, đồ vật `[data-testid=shot-props-<id>-<n>]` (dòng `tên: đầu -> cuối`) | `ShotListView()` báo lỗi ngay theo `checkShotList()` | như bước 3 | — | — |
| 6 | Biên kịch: ý tưởng `[data-testid=writer-idea-<id>]`, số cảnh `[data-testid=writer-count-<id>]`, xem kết quả `[data-testid=writer-result-<id>]` | `WriterView()` | như luồng 1 (Chạy) | node `writer`: `writerPrompt()` → `provider.generateText()` → `parseWriterReply()`; lỗi → `repairPrompt()` trong cùng chat, tối đa `WRITER_MAX_TRIES` (3) | **Muse**: 1–3 lượt chữ |
| 7 | Tạo từ mẫu `[data-testid=template-<mẫu>]` với mẫu `y-tuong-thanh-phim` | như luồng 2 | `POST /api/workflows/from-template/:templateId` | Nhân vật + Không gian → Biên kịch → Đồ vật (cổng `spec`) → Dựng phim | **Muse** |
| 8 | Node Cảnh (một cảnh, form tạm trước thẻ cảnh đợt 1B): cỡ cảnh `[data-testid=scene-size-<id>]`, góc máy `[data-testid=scene-angle-<id>]`, máy quay `[data-testid=scene-move-<id>]`, chủ thể `[data-testid=scene-subject-<id>]`, khung đầu `[data-testid=scene-start-<id>]`, chuyển động `[data-testid=scene-motion-<id>]`, đồ vật `[data-testid=scene-props-<id>]`, dịch vụ `[data-testid=scene-provider-<id>]`; xem khung đầu `[data-testid=scene-frame-<id>]`, clip `[data-testid=scene-clip-<id>]` | `SceneView()`; cổng vào Nhân vật, Không gian, Đồ vật (không bắt buộc), Nối tiếp (video, không bắt buộc); cổng ra `clip` (video có `clip` meta), `frame`, `last` (ảnh) | như luồng 1 (Chạy) | node `scene` (`src/nodes/scene/run.ts`): kiểm luật của riêng cảnh (`checkShotList()` một cảnh), có dây Nối tiếp là cảnh nối → `makeShot()` (cùng `stepScope` "film", cùng `cacheVersion` `SHOT_CACHE_VERSION` với Dựng phim nên cảnh giống hệt dùng lại kết quả) → luôn đo sáng → khung cuối `lastFrameOf()`; ước tính `estimate()` | **Muse**: 1 ảnh + 1 video (nối hoặc cắt không người không đồ vật: chỉ 1 video) |
| 9 | Node Ghép phim: bù sáng `[data-testid=film-combine-brightness-<id>]`; xem phim `[data-testid=film-combine-video-<id>]` | `FilmCombineView()`; cổng vào Clip (video, nhiều dây, thứ tự theo `order` rồi toạ độ `orderSources()`); cổng ra `video` | như luồng 1 (Chạy) | **trước node đầu tiên**: `preflightErrors()` (`src/core/preflight.ts`) — một nguồn cắm hai lần vào cổng nhiều dây là lỗi; `preflight()` của Ghép phim dựng chuỗi cảnh `scenesFeeding()` (`src/nodes/film-combine/definition.ts`; Cảnh có Nối tiếp phải nối đúng clip liền trước trong Ghép phim, liền trước là video khác thì coi là cảnh cắt) rồi `checkShotList()` cả chuỗi (nối, `MAX_CHAIN_RUN`, trạng thái đồ vật liên tục, tên/trạng thái lạ theo node Đồ vật); lỗi → mọi node trong phạm vi `skipped`, không gọi dịch vụ. Chạy: node `film-combine` (`src/nodes/film-combine/run.ts`) dựng phần ghép như Dựng phim → `concatParts()` (`src/nodes/film/shot-steps.ts`, `stepScope` "film": cùng cảnh với phim cũ thì không ghép lại) | ffmpeg |

### 4.2 Bên trong

- **Prompt**: một file `src/shared/prompts.ts` — `keyframePrompt()`, `motionPrompt()` (chỉ việc sau khung đầu + "Cuối cảnh: …"), `textVideoPrompt()`, `CHARACTER_SHEET()`, `LOCATION_SHEET()`, `propStillPrompt()`, `propStatePrompt()`, `writerPrompt()`, `repairPrompt()`; `DEFAULT_LOOK`. Gửi Muse nguyên văn (`verbatim: true`). Test `src/shared/prompts.test.ts` cấm "cinematic/photorealistic/2K", bắt buộc "không nhìn vào máy quay, không thêm người, không cắt cảnh, khung ngang 16:9".
- **Cảnh v2** `ShotSchema`: `start`, `motion`, `props`; dữ liệu cũ `action` đọc thành `start = motion = action` (`upgradeLegacyShot()`). `parsePropLines()`, `checkShotList(shots, known?)`: liên tục trạng thái, hệ quả phải có người/tay, tên/trạng thái lạ, cảnh báo > `MAX_PROP_REFS` (2) món.
- **Dựng phim** `src/nodes/film/run.ts` (chỉ điều phối): kiểm `checkShotList()` với danh sách đồ vật **trước khi gọi dịch vụ**, rồi mỗi cảnh gọi `makeShot()` ở `src/nodes/film/shot-steps.ts` (Cảnh dùng chung file này). Đường tạo cảnh: nối → `lastFrameOf()` = `frameOf(..., "last-frame")`, khoá `["chain-frame", clip]`; có người/tay → `keyframeFor()` trong chat phụ nhân vật (khoá chat `ctx.shared.chat.with(threadUrl)` chung cả máy chủ, chat mới nhất `ctx.shared.session()`/`updateSession()`), đính kèm ảnh toàn cảnh + `propsInFrame()` (ưu tiên món đổi trạng thái); không người có đồ vật → ảnh mới chat mới; không người không đồ vật → `textVideoPrompt()` chữ→video, ảnh xem trước `frameOf(..., "thumb")`. Mọi lần gọi dịch vụ qua `callProvider()`: khoá chat (nếu có) ở ngoài, chỗ dịch vụ `ctx.shared.slot()` ở trong; lấy được chỗ thì kiểm lần chạy đã dừng và cầu dao `ctx.shared.breaker` rồi mới gửi, lỗi máy chủ đếm vào cầu dao chung của lần chạy. Bù sáng: `measureBrightness()` → `ConcatPart.brightness` → `concatClips()` áp `eq` trong lần nén duy nhất (`ENCODE_V`: medium, CRF 17).
- **Phiên bản prompt trong khoá cache**: `definition.cacheVersion = codeVersion(<các hàm prompt node dùng>)` (`src/shared/prompts.ts`) → sửa prompt trong code thì node chạy lại khi bấm Chạy (bước con có prompt không đổi vẫn dùng cache). Kho thay mục cũ cùng tham số (`recordAsset()`).
- **Cổng vào không bắt buộc** `PortDef.optional`: `planGraph()` bỏ qua khi chưa nối (Dựng phim ← Đồ vật, Đồ vật ← Biên kịch, Biên kịch ← Nhân vật/Không gian).
- **Kho tài sản**: bảng `assets` (`src/core/db/schema.ts`, migration `0001`), ghi duy nhất `recordAsset()`; Đồ vật lưu danh sách món lấy từ kết quả (`storedParams()`). Ô chọn tải lại theo `EditorApi.refreshKey` (đổi workflow / lượt chạy mới).
- **Muse chữ** `generateText()`: prompt + "(Mã yêu cầu: …)"; `waitForText()` cắt câu trả lời sau mã (`replyAfterMarker()`), coi là xong khi đứng yên `TEXT_STABLE_CHECKS` (3) lần quét; không có JSON mà khớp lỗi/từ chối → `MUSE_FAILED`/`REFUSED`; hết `TEXT_WAIT_MS` → `NO_TEXT`. Dịch vụ giả: `fakeTextReply()` trả kịch bản hợp lệ.

### 4.3 Kiểm chứng tự động

| Lệnh | Kiểm gì |
|---|---|
| `npx vitest run src/shared src/nodes` | prompt chống nhựa, luật đồ vật/trạng thái, cảnh cũ `action`, đường tạo cảnh, đồ vật song song + dùng lại, Biên kịch đọc/sửa JSON |
| `npx vitest run src/nodes/film-combine` | Ghép phim: 3 clip theo `order` (thắng toạ độ) ra ~15 giây; Cảnh × 3 + Ghép phim sau Dựng phim cùng chữ ra đúng phim cũ, không gọi dịch vụ, không chạy lại ffmpeg ghép; preflight chặn Nối tiếp không đúng clip liền trước (cảnh đầu, đứng sau clip khác, nguồn không có trong Ghép phim), cho qua Cảnh nối từ video khác (coi là cắt), trạng thái đồ vật liên tục qua cả clip không phải Cảnh, trạng thái đồ vật không liên tục, trạng thái lạ, clip cắm hai lần (0 lượt); video không có `clip` dùng nguyên thời lượng |
| `npx vitest run src/nodes/scene src/nodes/film` | Cảnh: 4 đường tạo cảnh, Nối tiếp dùng khung cuối + cắt đầu `CHAIN_TRIM_SEC`, `take` 2 gọi lại, đồ thị Cảnh × 2 sau Dựng phim cùng chữ không tốn lượt (chung khoá bước con), hai cảnh cùng nhân vật chạy song song không trùng thời gian trong chat, ước tính lượt |
| `npx vitest run tests/api.test.ts` | kho: chạy xong vào kho, workflow khác dùng lại không gọi dịch vụ; mọi mẫu qua kiểm đồ thị, mẫu Sơn La không lỗi/cảnh báo |
| `npx playwright test e2e/muse-driver.spec.ts` | trang Muse giả trả chữ theo 3 đợt: chỉ nhận đợt cuối |
| `npx playwright test e2e/bien-kich.spec.ts` | bấm thật: mẫu Ý tưởng → phim (giả) ra 8 cảnh, chọn nhân vật từ kho ở workflow khác |
