# Canvas thẻ ảnh — Đợt 1A: bộ máy chạy, node Cảnh / Ghép phim, chuyển workflow cũ — kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi cảnh thành một node chạy riêng. Ghép phim nhận nhiều clip. Bộ máy chạy làm được song song, chạy một phần, có "lần tạo", ước tính lượt, huỷ. Workflow cũ tự chuyển sang dạng mới mà không tốn lượt Muse.

**Architecture:**
- `executeRun()` đổi sang lập lịch theo node sẵn sàng. Nó cung cấp cho node một bộ dùng chung trong lần chạy: chỗ chạy theo dịch vụ, khoá chat nhân vật, cầu dao.
- Node `scene` và `film-combine` chép logic từ `src/nodes/film/run.ts` và **tính khoá bước con y hệt** node `film`. Vùng khoá bước con giữ là `"film"`. Nhờ vậy workflow cũ chuyển sang trúng thẳng cache cũ, không cần chép dữ liệu.
- Hàm thuần trong `src/shared/scenes.ts` sinh nhóm cảnh từ danh sách cảnh. Hàm này dùng cho ba chỗ: Biên kịch, chuyển workflow cũ, và mẫu.

**Tech Stack:** TypeScript, Fastify, drizzle + better-sqlite3, zod 4, vitest, Playwright, React 19 + @xyflow/react 12.

**Spec:** `docs/superpowers/specs/2026-10-28-canvas-the-anh-design.md` (mục 4, 5, 6, 7). Phần giao diện (mục 8) là kế hoạch Đợt 1B, viết sau khi 1A đã gộp, vì 1B dựa trên đúng các API mà 1A tạo ra.

## Global Constraints

- Mọi quy tắc trong `CLAUDE.md` mục 5:
  - `process.env` chỉ đọc ở `config.ts`.
  - Media chỉ ghi qua `storage.importFile`.
  - Không viết comment `TODO`/`FIXME`/`tạm thời`.
  - Không để `catch` rỗng.
  - Registry chỉ sinh bằng `npm run new:node` / `gen:nodes`.
  - Mọi endpoint và `data-testid` mới phải có trong `FEATURE_MAP.md`.
  - Test không gọi Muse thật.
- Cấu trúc db: sửa `src/core/db/schema.ts` rồi chạy `npm run db:generate`. Không viết SQL tay.
- Không thêm thư viện mới.
- Lời báo lỗi và tiến độ bằng tiếng Việt, theo giọng các lời báo hiện có.
- Commit tiếng Việt dạng `<vùng>: <mô tả>`. Nhánh `canvas-dot-1a` tạo từ `main`. Mỗi task một commit. Hook commit chạy `npm run verify`.
- `SERVICE_FAILURE_LIMIT` = 3, `SHOT_SECONDS` = 5, `CHAIN_TRIM_SEC` = 2/24, `LAST_FRAME_FROM_END_SEC` = 0.2: dùng lại hằng số từ `src/nodes/film/definition.ts`, không chép giá trị.
- Node `film` và `shotlist` **giữ nguyên code**, chỉ thêm `hidden: true`. Bản sao lưu của workflow cũ vẫn chạy được.

## Review Focus

1. **Sau khi chuyển workflow Sơn La cũ: 0 lần gọi dịch vụ, `mediaId` của phim bằng phim cũ.** Test ở Task 6.
2. **Hai cảnh có người không bao giờ tạo ảnh khung cùng lúc trong một chat nhân vật**, kể cả khi chạy song song. Test ở Task 2 (khoá) và Task 3 (cảnh dùng khoá).
3. **Biên kịch chưa xong thì không cảnh nào trong nhóm do nó sinh ra được chạy**, và không gửi Muse cảnh nào khi người dùng đã sửa tay nhóm. Test ở Task 5.
4. **Cảnh lỗi chỉ kéo theo các node phía sau nó.** Cảnh độc lập vẫn chạy xong, và run báo lỗi kèm danh sách. Test ở Task 2.
5. **`take` = 1 hoặc không có `take` cho ra đúng khoá cache cũ** của mọi node đang có (nhân vật, bối cảnh, đồ vật, biên kịch). Thiếu điều này là tạo lại ảnh mẫu, tốn lượt. Test ở Task 1.

---

### Task 1: Cổng nhiều dây, `take`, cờ `hidden`

**Files:**
- Modify: `src/shared/ports.ts`: `PortDef` thêm `multiple?: boolean`. `PORT_KINDS` thêm `"image"`. `PortValueSchema` thêm `{ kind: "image", mediaId, width, height }`. Video thêm trường không bắt buộc `clip?: { trimStartSec: number; hasAudio: boolean; brightness?: { startLuma: number; endLuma: number; clipSec: number } }`.
- Modify: `src/shared/node-definition.ts`: thêm `hidden?: boolean`, `stepScope?: string`, `estimate?: (params: P, connected: ReadonlySet<string>) => Calls`. Thêm `export type Calls = { image: number; video: number; text: number }`.
- Modify: `src/core/node-runtime.ts`: `NodeInputs = Record<string, PortValue | PortValue[]>`. `requireInput` báo lỗi khi gặp mảng. Thêm `requireInputs`.
- Modify: `src/core/executor.ts`: `planGraph` nhận cổng `multiple`. `cacheKeyOf` bỏ `take` khi bằng 1. Khoá bước con dùng `stepScope ?? type` và thêm `take` khi lớn hơn 1.
- Modify: `src/features/editor/ui/graph-convert.ts`: cổng `multiple` thì không thay dây cũ.
- Test: `src/core/executor.test.ts`, `src/features/editor/ui/graph-convert.test.ts`.

**Interfaces:**
- Produces:
  - `requireInputs<K>(inputs: NodeInputs, name: string, kind: K): Extract<PortValue,{kind:K}>[]`
  - `PlannedNode.inputs: Map<string, { source: string; sourceHandle: string }[]>` (luôn là mảng)
  - `orderSources(p: PlannedNode, name: string, graph: WorkflowGraph): {source,sourceHandle}[]`: theo `params.order` (mảng mã node nguồn) trước. Phần còn lại xếp theo `position.x`, rồi đến `position.y`.
  - `takeOf(params: unknown): number` (mặc định 1)

- [ ] **Step 1: Viết test hỏng** trong `src/core/executor.test.ts`:
  - `"cổng multiple nhận 3 dây, node nhận mảng theo params.order"`: đồ thị 3 node nguồn → một node thử có cổng `multiple`. Đặt `order: ["c","a","b"]` thì node nhận giá trị theo thứ tự c, a, b. Bỏ `order` thì nhận theo toạ độ x tăng dần.
  - `"cổng thường vẫn báo lỗi khi có 2 dây"`: thông báo `có nhiều hơn một dây nối` như cũ.
  - `"take 1 hoặc không có take: cùng khoá cache; take 2: khoá khác"`: `cacheKeyOf("character", {description:"x",provider:"fake"}, {})` bằng khoá khi thêm `take: 1`, và khác khi `take: 2`.
  - `"khoá bước con dùng stepScope và thêm take khi > 1"`: một node có `stepScope: "film"` gọi `ctx.step(["a"])` ghi đúng khoá `sha256("step:film:" + stableStringify(["a"]))`. Đặt `take: 2` thì khoá khác.
- [ ] **Step 2:** Chạy `npx vitest run src/core/executor.test.ts`. Kết quả mong đợi: 4 test mới hỏng.
- [ ] **Step 3:** Làm theo phần Files. Node thử cho cổng `multiple` khai báo ngay trong file test (đi kèm `testNodes`), không đưa vào registry.
- [ ] **Step 4:** Thêm test vào `graph-convert.test.ts`: `connectionProblem` vẫn trả `null` cho cổng `multiple`, và `onConnect` không lọc dây cũ của cổng `multiple`. Phần lọc dây tách ra thành `replaceTargetEdges(edges, conn, isMultiple): Edge[]` trong `graph-convert.ts` để test được.
- [ ] **Step 5:** Chạy `npm run verify`. Kết quả mong đợi: xanh, toàn bộ 110 test cũ vẫn xanh.
- [ ] **Step 6:** Commit `loi: cổng nhận nhiều dây có thứ tự, lần tạo (take) trong khoá cache, vùng khoá bước con`.

### Task 2: Bộ máy chạy song song, phạm vi chạy, đồ dùng chung trong lần chạy, huỷ

**Files:**
- Create: `src/core/run-shared.ts`
- Modify: `src/core/executor.ts`, `src/core/node-runtime.ts` (`NodeRunContext.shared: RunShared`), `src/core/queue.ts`, `src/core/app-deps.ts` (thêm `chatLocks`), `tests/helpers/nodes.ts` (`testNodeCtx` tạo `shared` thật)
- Test: `src/core/run-shared.test.ts`, `src/core/executor.test.ts`, `tests/api.test.ts`

**Interfaces:**
- Produces:
  - `createChatLocks(): ChatLocks`, với `ChatLocks.with<T>(key: string, fn: () => Promise<T>): Promise<T>`. Tạo một lần cho cả máy chủ, nằm trong `AppDeps`.
  - `createRunShared(opts: { providers: ProviderRegistry; chatLocks: ChatLocks; failureLimit: number }): RunShared`
  - `RunShared.slot<T>(providerId: ProviderId, fn: () => Promise<T>): Promise<T>`: giới hạn theo `provider.maxParallel()`.
  - `RunShared.chat`: chính là `ChatLocks`.
  - `RunShared.session(ref: ChatSessionRef): ChatSessionRef`: trả chat mới nhất của nhân vật đó. `RunShared.updateSession(original: ChatSessionRef, next: ChatSessionRef): void`.
  - `RunShared.breaker`: `{ check(): void; record(err: unknown): void }`. Lỗi `ProviderError` mã `MUSE_FAILED` hoặc `NO_MEDIA` được đếm. Đủ `failureLimit` lần thì `check()` ném `ServiceBreakerOpen`, dùng nguyên lời báo trong `film/run.ts`. Lớp này chuyển sang `run-shared.ts`, và `film/run.ts` import lại từ đây.
  - `RunScope = { mode: "all" } | { mode: "node" | "downstream"; nodeId: string }`
  - `scopeNodes(order: PlannedNode[], scope: RunScope): Set<string>`:
    - `node`: node đó cùng mọi node phía trước nó.
    - `downstream`: node đó, mọi node phía sau, và mọi node phía trước của các node đó.
  - `executeRun(deps, runId, workflowId, graph, signal, scope: RunScope)`
  - `Queue.enqueue(workflowId, graph, scope?: RunScope): string`, `Queue.cancel(runId): "cancelled" | "not_found" | "finished"`
  - Bảng `runs` thêm cột `scope_json` (text, có thể rỗng) và `decision_json` (text, có thể rỗng; Task 5 dùng). Chạy `npm run db:generate`.

- [ ] **Step 1: Viết test hỏng**:
  - `run-shared.test.ts`:
    - `"chat.with cùng khoá chạy lần lượt, khác khoá chạy song song"`: đo thứ tự bắt đầu và kết thúc bằng promise chờ được.
    - `"slot giới hạn theo maxParallel"`: dịch vụ giả có `maxParallel() = 2`, 5 việc thì tối đa 2 việc chạy cùng lúc.
    - `"breaker đếm MUSE_FAILED/NO_MEDIA, lần thứ 3 thì check ném lỗi có chữ 'không gửi thêm để tránh tốn lượt'"`.
  - `executor.test.ts`:
    - `"node độc lập chạy song song"`: hai node thử, mỗi node chờ 200 ms. Tổng thời gian dưới 350 ms.
    - `"node lỗi: node phía sau bị skipped, node độc lập vẫn succeeded, run ném lỗi nêu tên node lỗi"`.
    - `"scope node: chỉ node đó và phía trước có dòng run_nodes; node khác không có dòng"`.
    - `"scope downstream: node đó và phía sau chạy"`.
  - `tests/api.test.ts`: `"huỷ run đang xếp hàng → failed, error 'Đã huỷ'"`, `"huỷ run đang chạy → signal bị huỷ, run failed 'Đã huỷ'"`. Node thử chờ signal.
- [ ] **Step 2:** Chạy `npx vitest run src/core tests/api.test.ts`. Kết quả mong đợi: các test mới hỏng.
- [ ] **Step 3:** Viết `executeRun` theo lối lập lịch:
  - Node có mọi nguồn đã xong (succeeded hoặc cached) thì khởi chạy ngay. Không có giới hạn tổng; chỉ giới hạn theo dịch vụ qua `slot`.
  - Node có nguồn lỗi hoặc bị skipped thì chuyển `skipped`, ghi lỗi `Bỏ qua vì "<tên node>" lỗi`.
  - Khi hết việc, nếu có node lỗi thì ném `Error` gồm số node lỗi và lời báo của từng node.
  - Node nằm ngoài phạm vi chạy thì không tạo dòng `run_nodes`.
- [ ] **Step 4:** `queue.ts`:
  - Mỗi run có một `AbortController` riêng, nối với tín hiệu dừng chung.
  - `cancel` với run đang `queued` thì chuyển sang `failed`, lỗi `"Đã huỷ"`. Với run đang chạy thì gọi `abort()`, và khi run kết thúc thì ghi lỗi `"Đã huỷ"`.
  - Run mở lại sau khi tắt máy (resume) dùng lại `scope_json` đã lưu.
- [ ] **Step 5:** Chạy `npm run verify`. Kết quả mong đợi: xanh.
- [ ] **Step 6:** Commit `loi: chạy song song theo node, chạy một phần, khoá chat/cầu dao dùng chung, huỷ lượt chạy`.

### Task 3: Node Cảnh (`scene`)

**Files:**
- Create bằng `npm run new:node -- scene`, sau đó viết lại: `src/nodes/scene/{definition.ts,run.ts,view.tsx,node.test.ts}`
- Create: `src/nodes/film/shot-steps.ts`. Chuyển `propsInFrame`, `pickView`, `frameOf`, `measureBrightness`, `keyframeFor` và phần tạo một cảnh từ `film/run.ts` sang đây. Cả `film` và `scene` cùng gọi file này. `film/run.ts` chỉ còn phần điều phối.

**Interfaces:**
- Consumes: `RunShared` (Task 2), `requireInputs`, `stepScope`, cổng `image` (Task 1).
- Produces:
  - `type ShotResult = { keyframeId: string; clipId: string; durationSec: number; trimStartSec: number; hasAudio: boolean; brightness?: Brightness }`
  - `makeShot(ctx: NodeRunContext, a: { shot: Shot; provider: MediaProvider; character: ImageSetValue; location: ImageSetValue; props?: PropSetValue; prevClipId?: string; measure: boolean }): Promise<ShotResult>`
  - `SceneParams = Omit<Shot, "id" | "link"> & { provider: ProviderId; take?: number }`
  - Node `scene`:
    - Cổng vào: `character` imageset, `location` imageset, `props` props (không bắt buộc), `follow` video (không bắt buộc, nhãn "Nối tiếp").
    - Cổng ra: `clip` video (có `clip` meta), `frame` image (khung đầu), `last` image (khung cuối).
    - `stepScope: "film"`, `cacheVersion` bằng của `film`, có `estimate`.

Yêu cầu về khoá bước con: `makeShot` gọi `ctx.step` với **đúng mảng khoá như `film/run.ts` hiện nay**:
- `["keyframe", provider.id, "chat", prompt, charIds, refIds]` / `["keyframe", provider.id, "new", prompt, refIds]`
- `["chain-frame", prevClipId]`
- `["clip", provider.id, prompt, keyframeId, SHOT_SECONDS]`
- `["clip-text", provider.id, prompt, SHOT_SECONDS]`
- `["thumb", clipId]`
- `["luma", clipId]`

Đây là việc **chuyển code nguyên khối**, không viết lại. Khung cuối dùng khoá `["chain-frame", clipId]` để chung cache với cảnh nối phía sau. `measure` luôn là `true` ở `scene`: đo độ sáng chỉ tốn ffmpeg, và có cache.

Ở `scene`, ảnh khung có người phải gọi qua `ctx.shared.chat.with(threadUrl, …)` và `ctx.shared.slot(provider.id, …)`. Chat đang dùng lấy từ `ctx.shared.session(character.session)`, chat trả về thì ghi lại bằng `updateSession`. Ở `film`, `semaphore` riêng được thay bằng đúng các lời gọi đó.

`estimate`: có `follow`, hoặc cảnh cắt không người không đồ vật, thì `{image:0, video:1, text:0}`. Còn lại `{image:1, video:1, text:0}`.

- [ ] **Step 1: Viết test hỏng** trong `src/nodes/scene/node.test.ts` (dịch vụ giả đếm lượt, `countingFakeProviders`):
  - `"cảnh không người không đồ vật → 0 ảnh, 1 video chữ, có frame từ thumb"`.
  - `"cảnh có người → ảnh trong chat nhân vật (imageSessions là threadUrl của character) rồi ảnh→video"`.
  - `"có follow → 0 ảnh, khung đầu là khung cuối clip trước, clip.trimStartSec = CHAIN_TRIM_SEC"`.
  - `"take 2 → gọi lại dịch vụ dù chữ y hệt"`.
  - `"khoá bước con giống film"`: chạy `film` (2 cảnh: một cắt có người, một nối) bằng `executeRun` trên db thử. Sau đó chạy đồ thị 2 node `scene` có cùng chữ, nối `follow`, trên cùng db. Lần sau `calls()` không tăng.
  - `"hai cảnh có người song song không trùng thời gian trong chat"`: dịch vụ giả ghi thời điểm bắt đầu và kết thúc mỗi lần tạo ảnh. Các khoảng thời gian không chồng nhau.
- [ ] **Step 2:** Chạy `npx vitest run src/nodes/scene src/nodes/film`. Kết quả mong đợi: test `scene` hỏng, test `film` cũ vẫn xanh.
- [ ] **Step 3:** Làm phần Files và Interfaces. `view.tsx` tạm là form gọn: khung đầu, chuyển động, đồ vật, cỡ cảnh, góc máy, máy quay, chủ thể, dịch vụ, cùng ảnh `frame` và clip. Đợt 1B sẽ thay bằng thẻ. Mọi phần tử có `data-testid` dạng `scene-<trường>-<id>`.
- [ ] **Step 4:** Chạy `npm run verify`. Kết quả mong đợi: xanh, gồm cả test `film` cũ.
- [ ] **Step 5:** Commit `canh: node Cảnh chạy riêng từng cảnh, dùng chung bước con với Dựng phim`.

### Task 4: Node Ghép phim (`film-combine`) và kiểm luật trước khi chạy

**Files:**
- Create bằng `npm run new:node -- film-combine`: `src/nodes/film-combine/*`
- Create: `src/core/preflight.ts`
- Modify: `src/shared/node-definition.ts` (`preflight?`), `src/core/executor.ts` (gọi preflight trước khi khởi chạy node đầu tiên)

**Interfaces:**
- Consumes: `requireInputs`, `orderSources` (Task 1), cổng video có `clip` (Task 3).
- Produces:
  - Node `film-combine`:
    - Cổng vào: `clips` video `multiple`.
    - Cổng ra: `video`.
    - Tham số: `{ fixBrightness: boolean; order?: string[] }`.
    - `stepScope: "film"`.
  - `preflight?: (ctx: PreflightCtx) => string[]`, trả về danh sách lỗi. `PreflightCtx = { node: PlannedNode; graph: WorkflowGraph; planned: Map<string, PlannedNode> }`.
  - `scenesFeeding(combineId, ctx): { shots: Shot[]; known?: KnownProp[] }`:
    - Dựng `Shot` từ tham số các node `scene` cắm vào, theo thứ tự `orderSources`.
    - `id` = mã node. `link` = `"chain"` nếu cổng `follow` có dây, còn lại `"cut"`.
    - `known` lấy từ tham số `items` của node `props` đầu tiên mà các cảnh cắm vào: tên và danh sách trạng thái tách bằng dấu phẩy, đúng cách node `props` đọc.

Ghép phim dựng `parts` **giống hệt** `film/run.ts`:
- Mỗi phần tử là `{ clipId, trimStartSec, durationSec, hasAudio, brightness? }`.
- Chỉ có `brightness` khi `fixBrightness`.
- Gọi `ctx.step(["concat", parts], …)`.

Clip thiếu `clip` meta (ví dụ video tải lên ở đợt 2) thì `trimStartSec = 0`, `hasAudio` lấy từ `probeVideo`.

- [ ] **Step 1: Viết test hỏng**:
  - `"3 clip theo order → 1 phim, thời lượng ≈ tổng"`.
  - `"phim giống hệt film cũ"`: chạy `film` 3 cảnh, rồi đồ thị `scene` × 3 + `film-combine`. `mediaId` phim bằng nhau, `calls()` không tăng.
  - `"preflight: cảnh đầu có follow → lỗi trước khi gọi dịch vụ, calls() = 0, lỗi nêu mã node"`.
  - `"preflight: trạng thái đồ vật không liên tục → lỗi, calls() = 0"`.
- [ ] **Step 2:** Chạy `npx vitest run src/nodes/film-combine src/core`. Kết quả mong đợi: hỏng.
- [ ] **Step 3:** Làm theo phần Files và Interfaces. Có lỗi preflight thì đánh dấu mọi node trong phạm vi chạy là `skipped`, rồi ném lỗi gộp. Không node nào được khởi chạy.
- [ ] **Step 4:** Chạy `npm run verify`. Kết quả mong đợi: xanh.
- [ ] **Step 5:** Commit `ghep-phim: node Ghép phim nhận nhiều clip, kiểm luật đạo diễn trước khi tốn lượt`.

### Task 5: Nhóm Phân cảnh, sinh cảnh từ Biên kịch, tự tạo lại khi Biên kịch đổi

**Files:**
- Create: `src/shared/scenes.ts`, `src/shared/scenes.test.ts`
- Create: `src/features/workflows/store.ts`. Chuyển việc ghi bảng `workflows` từ `routes.ts` sang đây: `saveWorkflowGraph(db, id, graph, name?)`. Đây là nơi ghi duy nhất, cập nhật `CLAUDE.md` mục 4.
- Modify: `src/shared/workflow.ts`: `WorkflowGraphSchema` thêm `groups` (mặc định `[]`).
- Modify: `src/core/executor.ts`: thêm phụ thuộc ngầm Biên kịch → các cảnh trong nhóm. Xong Biên kịch thì tự tạo lại nhóm, hoặc dừng để hỏi.
- Modify: `src/features/workflows/routes.ts`: thêm `POST /api/workflows/:id/scenes`.

**Interfaces:**
- Produces:
  - `GroupSchema = { id: string; label: string; nodeIds: string[]; source?: { writerId: string; resultKey: string; snapshot: string } }`
  - `expandScenes(graph: WorkflowGraph, a: { writerId?: string; groupId?: string; shots: Shot[]; refs: { character?: string; location?: string; props?: string }; provider: ProviderId; resultKey?: string; origin: { x: number; y: number } }): { graph: WorkflowGraph; groupId: string; combineId: string }`:
    - Có `groupId` thì thay các node của nhóm đó; mã node mới là `scene-<groupId>-<n>`.
    - Lưới 6 cột, ô rộng 230, cao 250.
    - Nối `character`/`location`/`props` vào từng cảnh. Cảnh `link: "chain"` thì nối `follow` từ cảnh liền trước.
    - Tạo node `film-combine` mới, hoặc dùng lại node đã có mà nhóm đang cắm vào. Đặt `order` theo thứ tự cảnh.
    - Ghi `source.snapshot = snapshotGroup(...)`.
  - `snapshotGroup(graph, groupId): string`: sha256 của danh sách tham số cảnh (bỏ `position`) theo thứ tự, cộng các dây chạm vào node trong nhóm.
  - `groupEdited(graph, groupId): boolean`: `snapshotGroup` khác `source.snapshot`.
  - `POST /api/workflows/:id/scenes` thân `{ writerId: string; choice?: "replace" | "keep" }`:
    - Lấy kết quả Biên kịch mới nhất trong `run_nodes`. Không có thì 409 `"Biên kịch chưa có kết quả: bấm Chạy trước"`.
    - Mặc định (và khi `"replace"`) thì `expandScenes`. Khi `"keep"` thì chỉ cập nhật `source.resultKey` và `snapshot`.
    - Trả workflow mới.
  - `runs.decision_json` khi dừng để hỏi: `{ kind: "scenes-edited"; writerId: string; groupId: string }`. `RunResponseSchema` thêm `decision`.

Luật lúc chạy (mục 5.4 của bản thiết kế):
- Cảnh trong nhóm có `source.writerId` chỉ được khởi chạy sau khi Biên kịch đó xong.
- Khi khoá cache của Biên kịch khác `source.resultKey`:
  - Nhóm chưa bị sửa tay: `expandScenes`, gọi `saveWorkflowGraph`, lập lại kế hoạch phần còn lại theo đồ thị mới, rồi chạy tiếp trong cùng run.
  - Nhóm đã bị sửa tay: ghi `decision_json`, các cảnh trong nhóm và mọi node phía sau chuyển `skipped`, run lỗi với lời báo `"Biên kịch ra bộ cảnh mới nhưng thẻ cảnh đã được sửa tay — chọn Thay hoặc Giữ"`.

- [ ] **Step 1: Viết test hỏng**:
  - `scenes.test.ts`:
    - `"expandScenes 12 cảnh Sơn La: 12 scene, 2 dây follow (c06, c10), 36 dây tham chiếu, combine order đúng 12 mã"`.
    - `"thay nhóm: mã node ổn định theo số thứ tự"`.
    - `"groupEdited false ngay sau expand, true khi đổi motion một cảnh"`.
  - `tests/api.test.ts`, mẫu Ý tưởng → phim với dịch vụ giả:
    - `"chạy lần đầu: Biên kịch xong rồi mới có cảnh chạy, ra phim"`.
    - `"đổi ý tưởng, chạy lại: nhóm tự tạo lại, cảnh chữ không đổi thì cached"`.
    - `"đã sửa tay một cảnh, đổi ý tưởng, chạy: run failed có decision scenes-edited, số lần gọi video/ảnh = 0"`.
    - `"POST scenes choice keep rồi chạy: dùng thẻ đã sửa"`.
- [ ] **Step 2:** Chạy `npx vitest run src/shared/scenes.test.ts tests/api.test.ts`. Kết quả mong đợi: hỏng.
- [ ] **Step 3:** Làm theo phần Interfaces và Luật lúc chạy. Đường vào bảng `workflows` chỉ đi qua `store.ts`.
- [ ] **Step 4:** Chạy `npm run verify`. Kết quả mong đợi: xanh.
- [ ] **Step 5:** Commit `phan-canh: nhóm cảnh sinh từ Biên kịch, tự tạo lại khi Biên kịch đổi, hỏi khi đã sửa tay`.

### Task 6: Chuyển workflow cũ và đổi mẫu

**Files:**
- Create: `src/features/workflows/upgrade.ts`, `src/features/workflows/upgrade.test.ts`
- Modify: `src/features/workflows/routes.ts`: gọi `upgradeLegacyGraph` ở `GET /api/workflows/:id` và `/default`.
- Modify: `src/shared/templates.ts`: dựng hai mẫu bằng `expandScenes`, bỏ `shotlist`/`film`. Phần sửa dở cảnh 5 của phiên khác (đang nằm ở file vá) **không** gộp vào đây.
- Modify: `src/nodes/film/definition.ts`, `src/nodes/shotlist/definition.ts`: thêm `hidden: true`.

**Interfaces:**
- Consumes: `expandScenes` (Task 5), `saveWorkflowGraph` (Task 5).
- Produces:
  - `upgradeLegacyGraph(graph: WorkflowGraph, lastWriterOutput?: NodeOutputs): { graph: WorkflowGraph; changed: boolean }`
  - `upgradeWorkflowOnOpen(db, row): WorkflowResponse`:
    - Khi `changed`: lưu bản gốc thành workflow `<id>-ban-cu`, tên `"<tên> (bản cũ)"`, nếu bản đó chưa có. Sau đó lưu bản mới.
    - Kết quả Biên kịch lấy từ `run_nodes` của **run mới nhất có `film` succeeded** trong workflow này.

Quy tắc chuyển, cho mỗi node `film`:
- Danh sách cảnh lấy từ node nối vào cổng `shots`:
  - `shotlist`: dùng `params.shots`.
  - `writer`: dùng `lastWriterOutput.shots`. Không có thì không tạo cảnh.
- `expandScenes` với `refs` = các node đang nối vào `character`/`location`/`props` của `film`, `provider` = `film.params.provider`, `origin` = vị trí của `film`.
- `film-combine.fixBrightness` = `film.params.fixBrightness`.
- Xoá `film` và `shotlist`, cùng các dây của chúng.
- Biên kịch có cảnh được sinh ra thì nhóm có `source.writerId` và `source.resultKey` = khoá cache Biên kịch trong run đó.

- [ ] **Step 1: Viết test hỏng**:
  - `upgrade.test.ts`:
    - `"Sơn La cũ → 12 scene + 1 film-combine, không còn shotlist/film, dây follow ở cảnh 6 và 10"`.
    - `"Ý tưởng → phim cũ có kết quả Biên kịch → 8 scene, nhóm có source.writerId"`.
    - `"không có kết quả Biên kịch → chỉ còn writer + film-combine rỗng"`.
    - `"graph mới không đổi (changed=false)"`.
  - `tests/api.test.ts`:
    - `"workflow Sơn La cũ chạy xong bằng film; GET → đã chuyển, có bản '-ban-cu'; chạy lại → calls() không tăng, mediaId phim bằng phim cũ"`.
    - `"bản '-ban-cu' vẫn chạy được (cached)"`.
- [ ] **Step 2:** Chạy `npx vitest run src/features/workflows tests/api.test.ts`. Kết quả mong đợi: hỏng.
- [ ] **Step 3:** Làm theo phần Files, Interfaces và Quy tắc chuyển. Test mẫu hiện có trong `api.test.ts` (`"mọi mẫu đi qua kiểm đồ thị…"`) đổi sang kiểm qua `preflight` của `film-combine`.
- [ ] **Step 4:** Chạy `npm run verify`. Kết quả mong đợi: xanh.
- [ ] **Step 5:** Commit `chuyen-doi: workflow cũ tự sang node Cảnh/Ghép phim không tốn lượt, mẫu dùng node mới`.

### Task 7: API chạy theo phạm vi, ước tính, huỷ, kết quả gộp theo node

**Files:**
- Create: `src/core/estimate.ts`, `src/core/estimate.test.ts`
- Modify: `src/core/executor.ts`: tách `computeKeys(order, graph): Map<nodeId, key>` để `estimate.ts` dùng chung, không tính khoá hai nơi.
- Modify: `src/features/workflows/routes.ts`, `src/features/runs/routes.ts`, `src/shared/api.ts`, `src/app/api-client.ts`
- Modify: thêm `estimate` vào `definition.ts` của:
  - `character`: `{image:4}`.
  - `location`: `{image:2}`.
  - `props`: số trạng thái của mọi món. Trạng thái tách bằng dấu phẩy, dùng lại hàm tách đang có ở `src/nodes/props/definition.ts`.
  - `writer`: `{text:1}`.
  - `generate-video`: `{video:1}`.
  - `prompt`: 0.
- Modify: `FEATURE_MAP.md` (luồng mới), `DEBT.md` (N-005 chuyển sang "Đã trả")

**Interfaces:**
- Produces:
  - `POST /api/workflows/:id/runs`: thân `{ scope?: RunScope }`. Vẫn trả 202 `{ runId }`. Thân `{}` giữ nguyên cách chạy cũ.
  - `POST /api/workflows/:id/estimate`: thân `{ scope?: RunScope }`. Trả `EstimateResponse = { nodes: { id: string; label: string; provider: ProviderId | null; status: "cached" | "run" | "unknown"; calls: Calls }[]; total: Calls; museTotal: Calls; waitsOnWriter: boolean }`.
    - `"unknown"` dành cho cảnh trong nhóm có Biên kịch sẽ chạy lại.
    - `museTotal` chỉ cộng các node có `provider === "muse"`.
  - `POST /api/runs/:id/cancel`: trả 200 `{ result }`, hoặc 404.
  - `GET /api/workflows/:id/runs/latest`: trả `{ run, nodes }`. `nodes` lấy, cho từng mã node trong đồ thị hiện tại, dòng `run_nodes` mới nhất trong mọi run của workflow. Giao diện của PR #6 đọc trường mới này thay cho `run.nodes`.
  - `api-client.ts`: `startRun(id, scope?)`, `estimate(id, scope?)`, `cancelRun(runId)`, `expandScenes(id, writerId, choice?)`.

- [ ] **Step 1: Viết test hỏng**:
  - `estimate.test.ts`:
    - `"Sơn La mới chưa chạy: museTotal = { image: 24, video: 12, text: 0 }"`. Cách ra con số:
    - Ảnh khung: 12 cảnh, trừ c07 (chữ→video) và c06, c10 (nối), còn 9.
    - Ảnh mẫu: nhân vật 4, bối cảnh 2, đồ vật 9 trạng thái.
    - Con số này khớp lần chạy thật 28/10 ghi trong `TASKS.md`: 24 ảnh, 12 video.
    - `"chạy xong rồi ước tính: total 0, mọi node cached"`.
    - `"sửa motion cảnh 5 → run: cảnh 5 và cảnh 6, video = 2"`.
    - `"take cảnh 3 = 2 → video = 1, ảnh = 1"`.
  - `tests/api.test.ts`:
    - `"POST runs scope node chỉ chạy node đó"`.
    - `"latest gộp theo node: chạy all rồi chạy node → nodes có đủ mọi node"`.
    - `"cancel 404 với run lạ"`.
- [ ] **Step 2:** Chạy `npx vitest run src/core/estimate.test.ts tests/api.test.ts`. Kết quả mong đợi: hỏng.
- [ ] **Step 3:** Làm theo phần Interfaces, rồi đổi `Editor.tsx` đọc `nodes` từ `latest`.
- [ ] **Step 4:** Ghi `FEATURE_MAP.md`: một mục "Luồng 4 — Cảnh riêng, Ghép phim, chạy một phần", cùng các endpoint mới. Ghi `DEBT.md`.
- [ ] **Step 5:** Chạy `npm run verify`. Kết quả mong đợi: xanh (test kiến trúc kiểm endpoint có trong FEATURE_MAP).
- [ ] **Step 6:** Commit `api: chạy theo phạm vi, ước tính lượt, huỷ lượt chạy, kết quả gộp theo node`.

### Task 8: Giao diện tối thiểu để dùng được 1A, sửa e2e

**Files:**
- Modify: `src/features/editor/ui/Editor.tsx`:
  - Ô thêm node bỏ qua node `hidden`.
  - Hiện hộp hỏi khi `run.decision.kind === "scenes-edited"`, có 2 nút Thay / Giữ gọi `api.expandScenes`. `data-testid`: `scenes-decision`, `scenes-replace`, `scenes-keep`.
  - Nút Huỷ khi đang chạy, `data-testid=cancel-run`.
- Modify: `src/nodes/writer/view.tsx`: nút **Tạo thẻ cảnh** (`data-testid=writer-expand-<id>`) gọi `api.expandScenes`.
- Modify: `e2e/chuoi-canh.spec.ts`, `e2e/bien-kich.spec.ts`, `e2e/workflow-cu.spec.ts`: theo node mới.
- Modify: `FEATURE_MAP.md`: các `data-testid` mới.

- [ ] **Step 1:** Sửa e2e trước, theo kịch bản mới:
  - `chuoi-canh`: tạo từ mẫu Sơn La → đổi dịch vụ giả ở mọi node → Chạy → 12 node cảnh "Xong", phim khoảng 60 giây.
  - `bien-kich`: mẫu Ý tưởng → Chạy → có 8 node cảnh → sửa ý tưởng → Chạy → nhóm được tạo lại. Sửa tay một cảnh → sửa ý tưởng → Chạy → thấy `scenes-decision` → bấm `scenes-keep`.
  - `workflow-cu`: PUT một đồ thị cũ có `shotlist`/`film` → mở → thấy node `scene`.
- [ ] **Step 2:** Chạy `npx playwright test e2e/chuoi-canh.spec.ts e2e/bien-kich.spec.ts e2e/workflow-cu.spec.ts`. Kết quả mong đợi: hỏng.
- [ ] **Step 3:** Làm phần Files.
- [ ] **Step 4:** Chạy `npm run verify:full`. Kết quả mong đợi: xanh. Test `muse-driver` từng hỏng chập chờn vì Chrome khoá file khi có phiên khác chạy Muse; nếu gặp lại thì chạy lại riêng file đó và ghi trong PR.
- [ ] **Step 5:** Mở app (`.claude/launch.json`), mở workflow Sơn La thật:
  - Thấy 12 node cảnh có ảnh, có bản `-ban-cu`.
  - Gọi `POST /estimate` bằng curl: `museTotal` = 0.
  - Chưa bấm Chạy với Muse ở bước này.
- [ ] **Step 6:** Commit `giao-dien: dùng node Cảnh/Ghép phim, hỏi khi thẻ cảnh đã sửa tay, nút huỷ, sửa e2e`.

### Task 9: Thử Muse thật và mở PR

- [ ] **Step 1:** Dừng máy chủ dev watch. Chạy máy chủ không watch: `npx tsx src/server.ts`, kèm `npx vite`.
- [ ] **Step 2:** Workflow Sơn La thật (đã chuyển) → `POST /runs` thân `{}` → chờ xong.
  - Mong đợi: 0 lượt Muse, `mediaId` phim bằng phim cũ (`70ba80fe-…`).
- [ ] **Step 3:** Sửa chữ chuyển động cảnh 3 → `POST /estimate` phải ra `video: 1`, rồi chạy.
  - Mong đợi: 1 video Muse, phim mới đúng khoảng 59,8 giây.
  - Xem đầu, giữa, cuối clip cảnh 3 (ffprobe + rút khung).
- [ ] **Step 4:** Ghi nhật ký lượt Muse vào `TASKS.md`. Cùng một lỗi lặp 3 lần thì dừng và báo chủ dự án (`CLAUDE.md` mục 6).
- [ ] **Step 5:** Push nhánh `canvas-dot-1a`, mở PR có tóm tắt và bằng chứng. CI xanh thì gộp (`CLAUDE.md` mục 6A).
