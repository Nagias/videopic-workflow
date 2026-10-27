# Bộ khung đi được — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một luồng xuyên suốt nhỏ nhất chạy thật: canvas có node Prompt → node Tạo video → bấm Chạy → job vào hàng đợi → provider (fake hoặc Muse thật) tạo clip → clip lưu `.data/media` → hiện trên node; chạy lại không đổi gì thì dùng lại kết quả.

**Architecture:** TypeScript một gói. Fastify phục vụ API + worker hàng đợi trong cùng tiến trình; SQLite lưu workflow/run/media; node theo thư mục `src/nodes/<loại>/` với registry sinh tự động; provider sau giao diện `VideoProvider`.

**Tech Stack:** Node 24, TypeScript 6.0.3, React 19, Vite 8, @xyflow/react 12, Fastify 5, zod 4, drizzle-orm 0.45 + better-sqlite3 13, Playwright 1.64, Vitest 5, ESLint 10 + typescript-eslint 8.

**Spec:** `docs/ARCHITECTURE.md`

## Global Constraints

- Chỉ ghi/xoá trong `D:\29. Workflow VideoPic`. Story Studio chỉ đọc.
- `.data/` không bao giờ lên git (hồ sơ Chrome, db, media).
- Chuỗi người dùng thấy: tiếng Việt có dấu. Tên biến/hàm: tiếng Anh.
- Commit: tiếng Việt, dòng đầu dạng `<vùng>: <mô tả>`.
- Test không gọi Muse thật trừ khi `MUSE_LIVE=1`.
- Thời lượng clip Muse chỉ 5 hoặc 10 giây.

## Review Focus

1. Muse trả lại video CŨ trong đoạn chat → phải bị loại (sha256 đã có trong bảng `media` hoặc dài > 2×yêu cầu + 0.5s). Test ở Task 4.
2. Hồ sơ Chrome hết phiên đăng nhập → node báo lỗi tiếng Việt "cần đăng nhập lại", không treo. Test ở Task 4 (đơn vị: phân loại lỗi).
3. Tắt máy chủ giữa lúc chạy → mở lại thì run tiếp tục, node đã xong không gọi lại provider. Test ở Task 5.
4. Prompt rỗng / đồ thị có vòng / nối sai kiểu → báo lỗi rõ trước khi gọi provider. Test ở Task 3.
5. Bấm Chạy hai lần liên tiếp không đổi gì → lần hai dùng lại cache, provider chỉ được gọi 1 lần. Test ở Task 3 và e2e Task 7.

---

### Task 1: Nền dự án, tài liệu agent, CI, khoá nhánh

**Files:** `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `.gitignore`, `.gitattributes`, `CLAUDE.md`, `FEATURE_MAP.md`, `DEBT.md`, `TASKS.md`, `.claude/settings.json`, `.github/workflows/ci.yml`, `tests/smoke.test.ts`

- [ ] `npm run verify` = `lint && typecheck && test` chạy xanh với 1 test giả.
- [ ] Commit đầu trên `main`, tạo repo công khai `Nagias/videopic-workflow`, push, bật khoá nhánh (bắt PR, bắt check `verify`, cấm force-push, áp cả admin), bật auto-merge.

### Task 2: Lõi máy chủ — config, db, storage, ffmpeg

**Files:** `src/core/config.ts`, `src/core/db/{schema.ts,client.ts}`, `drizzle.config.ts`, `src/core/storage.ts`, `src/core/ffmpeg.ts`, tests cạnh file.

**Interfaces (Produces):**
- `loadConfig(env?: NodeJS.ProcessEnv): AppConfig` — `{ dataDir, dbPath, mediaDir, profilesDir, port, appEnv: 'dev'|'test', museLive: boolean, ffmpegPath, ffprobePath }`.
- `openDb(dbPath: string): Db` (chạy migration khi mở).
- Bảng: `workflows(id, name, graph_json, updated_at)`, `runs(id, workflow_id, graph_json, status, error, created_at, started_at, finished_at)`, `run_nodes(run_id, node_id, status, cache_key, output_json, error, message, updated_at)`, `media(id, sha256 UNIQUE, kind, rel_path, width, height, duration_sec, source, created_at)`, `node_cache(cache_key PK, output_json, created_at)`.
- `createStorage(cfg, db): Storage` — `importFile(tmpPath, {kind, source}): Promise<MediaRecord>` (băm sha256, chuyển vào `media/YYYY-MM/<id>.<ext>`), `hasSha256(sha): boolean`, `getMedia(id): MediaRecord | undefined`, `absPath(rec): string`, `tmpPath(ext): string`.
- `probeVideo(path): Promise<{width,height,durationSec,hasAudio}>`, `makeTestClip({out, durationSec, colorHex, width, height}): Promise<void>`.

- [ ] Test: `probeVideo` đọc đúng clip do `makeTestClip` tạo (5s, 1280×720, có tiếng).
- [ ] Test: `importFile` hai lần cùng nội dung → trả cùng bản ghi, `hasSha256` đúng.

### Task 3: Đồ thị, node, executor có cache

**Files:** `src/shared/{ports.ts,workflow.ts}`, `src/nodes/prompt/*`, `src/nodes/generate-video/*`, `scripts/gen-nodes.ts`, `src/nodes/registry.{server,web}.ts` (sinh), `src/core/executor.ts`.

**Interfaces:**
- `PortValue = { kind: 'text'; text: string } | { kind: 'video'; mediaId: string }`.
- `NodeDefinition<P>`: `{ type, label, inputs: Port[], outputs: Port[], params: ZodType<P>, defaults: P }`.
- `NodeRun<P> = (ctx: NodeRunContext, inputs: Record<string, PortValue>, params: P) => Promise<Record<string, PortValue>>`.
- `executeRun(deps, runId, graph, hooks): Promise<void>` — thứ tự topo, `cacheKey = sha256(type|stableJson(params)|cacheKeys phía trên theo tên cổng)`, có cache thì dùng lại (status `cached`).
- Node `prompt`: params `{ text: string }` (trim, ≥1 ký tự) → out `text`.
- Node `generate-video`: in `prompt:text`; params `{ provider: 'fake'|'muse', durationSec: 5|10 }` → out `video`.

- [ ] Test: graph Prompt→Video với provider giả đếm số lần gọi: chạy 2 lần → gọi 1 lần, lần 2 status `cached`.
- [ ] Test: đổi prompt → gọi lại. Vòng / nối sai kiểu / prompt rỗng / loại node lạ → lỗi tiếng Việt, provider không bị gọi.

### Task 4: Provider fake + Muse

**Files:** `src/providers/types.ts`, `src/providers/index.ts`, `src/providers/fake/index.ts`, `src/providers/muse/{index.ts,accounts.ts,browser.ts,dom.ts,prompt.ts,validate.ts}`, `scripts/muse-login.ts`, `scripts/smoke-muse.ts`.

**Interfaces:** `VideoProvider.generateVideo({ prompt, durationSec }, { signal, onProgress, storage }) → { mediaId }`.

- [ ] Test: fake tạo clip đúng thời lượng, màu khác nhau theo prompt.
- [ ] Test: `formatVideoPrompt` (giữ khuôn Story Studio), `validateVideoProbe` (loại clip < 3s, > 2×yêu cầu+0.5s, dọc/vuông, < 360px), `classifyMuseError`.
- [ ] Test: Muse từ chối chạy khi `appEnv=test` và không `MUSE_LIVE`.
- [ ] `npm run smoke:muse` (chạy tay, gọi thật 1 clip 5s).

### Task 5: Hàng đợi + API

**Files:** `src/core/queue.ts`, `src/features/workflows/routes.ts`, `src/features/runs/routes.ts`, `src/features/media/routes.ts`, `src/app-server.ts` (`buildServer(deps)`), `src/server.ts`.

**API:** `GET /api/workflows/default`, `PUT /api/workflows/:id`, `POST /api/workflows/:id/runs` → `{ runId }`, `GET /api/runs/:id` → `{ status, error, nodes: { [nodeId]: { status, message, error, output } } }`, `GET /api/media/:id` (stream, hỗ trợ Range), `GET /api/node-types`.

- [ ] Test (fastify.inject + fake): lưu → chạy → poll tới `succeeded` → media tải về được.
- [ ] Test: run để `running` trong db + khởi động lại queue → chạy xong, provider không gọi lại node đã có cache.

### Task 6: Giao diện canvas

**Files:** `index.html`, `vite.config.ts`, `src/app/{main.tsx,App.tsx,api-client.ts,styles.css}`, `src/features/editor/ui/*`, `src/nodes/*/view.tsx`.

- [ ] Canvas tải workflow mặc định, sửa prompt, chọn dịch vụ/thời lượng, nút Chạy, trạng thái từng node, video xem được trong node.

### Task 7: Khoá cứng + e2e + công cụ

**Files:** `tests/architecture.test.ts`, `e2e/khung-di-duoc.spec.ts`, `playwright.config.ts`, `scripts/new-node.ts`, `.githooks/{pre-commit,commit-msg}`.

- [ ] e2e: mở app (fake), gõ prompt, Chạy → node báo "Xong", `<video>` có thời lượng ≈5s; Chạy lại → "Dùng lại kết quả".
- [ ] Kiến trúc: registry khớp thư mục; mỗi node đủ 4 file; route nào cũng có trong FEATURE_MAP; DEBT.md đúng cột.

### Task 8: Chạy thật + điền FEATURE_MAP + sổ nợ

- [ ] Mở app, bấm như người thật với Muse thật, sửa lỗi gặp phải. Điền FEATURE_MAP luồng 1. Ghi nợ vào DEBT.md. PR, CI xanh, gộp.
