# Canvas thẻ ảnh — Đợt 1B: giao diện thẻ ảnh, khung bên phải, ô tìm node, menu chuột phải — kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canvas trông và dùng như bản phác `canvas-v1.html`:
- node là thẻ ảnh/video không có form;
- sửa ở khung bên phải;
- thêm node bằng ô tìm hoặc thả dây ra chỗ trống;
- menu chuột phải;
- chạy một node / từ đây trở đi;
- hộp xác nhận số lượt Muse;
- ô hàng chờ, minimap.

**Architecture:**
- Không viết lại các form: khung bên phải (Inspector) hiện chính `View` của node đang chọn (`src/nodes/<ten>/view.tsx`, đã có).
- Thẻ trên canvas là một component chung `NodeCard`, chọn cách hiện theo loại dữ liệu ở cổng ra (ảnh, video, bộ ảnh, đồ vật, chữ) và một dòng tóm tắt do `definition.cardLine` cung cấp.
- Nhóm Phân cảnh vẽ thành một khung React Flow riêng, dựng từ `graph.groups`, không lưu vào `graph.nodes`.
- Mọi API đã có từ 1A (`startRun(id, scope)`, `estimate`, `cancelRun`, `expandScenes`, `getLatestRun`); 1B chỉ thêm 3 thay đổi nhỏ phía máy chủ (Task 2).

**Tech Stack:** React 19, @xyflow/react 12.12 (dùng sẵn `MiniMap`, `Controls`, `useStore`), Vite, Playwright e2e với dịch vụ giả. Máy chủ: Fastify, drizzle.

**Spec:** `docs/superpowers/specs/2026-10-28-canvas-the-anh-design.md`, mục 8 (8.1–8.6, phần "Đợt 1"), 6.2 (dải thứ tự ở Ghép phim), 5.4. Bản phác: `.superpowers/brainstorm/4475-1793197854/content/canvas-v1.html` (chỉ có trên máy chủ dự án, nằm trong `.gitignore`; mở thẳng file để xem bố cục, ảnh sẽ không hiện). Việc chuyển từ 1A: `TASKS.md`, mục "Việc chuyển sang Đợt 1B".

## Global Constraints

- Mọi quy tắc trong `CLAUDE.md` mục 5:
  - Giao diện chỉ gọi máy chủ qua `src/app/api-client.ts`.
  - File dùng chung (`src/shared/**`, `definition.ts`) chỉ import zod và file shared khác.
  - Không viết comment `TODO`/`FIXME`/`tạm thời`.
  - Không để `catch` rỗng.
  - Mọi `data-testid` và endpoint mới phải có trong `FEATURE_MAP.md`; khoá kiến trúc kiểm việc này.
  - Test không gọi Muse thật.
- **Không thêm thư viện**: không Tailwind, không thư viện biểu tượng, không thư viện kéo thả. Biểu tượng dùng ký tự Unicode như bản phác.
- Thẻ trên canvas **không có ô nhập**. Ngoại lệ duy nhất là node Prompt/Văn bản: nháy đúp để sửa chữ ngay trên thẻ (spec 8.2).
- Lệnh chưa làm trong đợt này thì **ẩn**, không để lệnh chết (spec 8.4).
- Chữ giao diện bằng tiếng Việt. Màu cổng/dây giữ đúng như hiện có (`styles.css`, `.kind-*`).
- Commit tiếng Việt dạng `<vùng>: <mô tả>`. Nhánh `canvas-dot-1b` tạo từ `main` (sau khi PR #8 gộp). Mỗi task một commit. Hook chạy `npm run verify`; task nào đổi giao diện thì chạy thêm `npm run verify:full` trước khi báo xong.
- Giữ nguyên mọi `data-testid` đang có trong `FEATURE_MAP.md`; chỉ đổi chỗ đặt. Ví dụ `scene-motion-<id>` chuyển từ thân thẻ sang khung bên phải. Test e2e cũ chỉ cần thêm bước bấm chọn node trước.

## Review Focus

1. **Sửa trong khung bên phải phải tự lưu như cũ, và không lưu đè nhóm cảnh máy chủ vừa tạo lại.** Kẽ hở N-016 được bịt hẳn bằng kiểm phiên bản ở Task 2. Test ở Task 2 và Task 3.
2. **Chạy một node có 0 lượt Muse thì không hỏi; có lượt hoặc có node "chưa biết" thì luôn hỏi**, và hộp hỏi ghi rõ "chưa biết" chứ không cộng thành 0. Test ở Task 7.
3. **Thả dây ra chỗ trống rồi chọn node thì node mới nằm ở chỗ thả và đã nối dây đúng cổng.** Cổng vào đã có dây thì dây mới thay dây cũ. Test ở Task 5.
4. **Kéo khung nhóm Phân cảnh thì mọi thẻ trong nhóm đi theo.** Vị trí được lưu, và nhóm không bị tính là "đã sửa tay" (vì `snapshotGroup` bỏ qua toạ độ). Test ở Task 4.
5. **Workflow 30 node, gồm 2 nhóm 12 cảnh: kéo và phóng to không giật.** Thu nhỏ màn hình thì thẻ chỉ hiện ảnh và tên. Test ở Task 9.

---

### Task 1: Tách Editor thành các phần nhỏ, dựng bố cục mới (chưa đổi hành vi)

**Files:**
- Create:
  - `src/features/editor/ui/use-workflow.ts`: tải, mở và tự lưu workflow; giữ `groups` và `savedGraph`.
  - `src/features/editor/ui/use-run.ts`: lượt chạy, poll, gộp kết quả, tải lại giữa và cuối lượt chạy, huỷ.
  - `src/features/editor/ui/TopBar.tsx`, `Rail.tsx`, `Inspector.tsx` (tạm rỗng), `QueuePanel.tsx` (tạm rỗng).
- Modify: `Editor.tsx` (chỉ còn ghép các phần), `src/app/styles.css` (lưới bố cục: thanh trên 48px, thanh trái 52px, canvas, khung phải 340px).

**Interfaces:**
- Produces:
  - `useWorkflow(): { workflowId, graph/nodes/edges setters, groups, saveState, notice, save(): Promise<void>, flushEdits(): Promise<void>, applyGraph(g: WorkflowGraph): void, switchTo(load) }`
  - `useRun(wf: ReturnType<typeof useWorkflow>): { run, nodeStates: Record<string, RunNodeState>, fromHistory, active, startRun(scope?: RunScope): Promise<void>, cancel(): Promise<void>, decide(choice: "replace"|"keep"): Promise<void> }`
  - `startRun` nhận `scope` (Task 6 dùng). Hành vi giữ y hệt `Editor.tsx` hiện nay: lưu trước, tải lại giữa lượt chạy khi Biên kịch xong, tải lại cuối lượt.

- [ ] **Step 1:** Chạy `npm run verify:full`, ghi lại số test đang xanh để làm mốc.
- [ ] **Step 2:** Chuyển code sang hai hook và các component trên. Đây là việc chuyển nguyên khối, không viết lại logic lưu/poll/sync. `run-sync.ts` giữ nguyên.
  - Thanh trái chỉ đặt nút của việc có trong 1B: ＋ Thêm node (Task 5), 🗂 Kho, ▦ Mẫu (mở ô tìm ở đúng nhóm), ▢ Nhóm (Task 4), ⌨ Phím tắt (Task 6).
  - Không đặt nút Lịch sử, Ghi chú dán, Cài đặt (chưa làm thì ẩn).
  - Ô chọn workflow và các nút mẫu hiện có chuyển lên thanh trên, giữ testid.
- [ ] **Step 3:** Chạy `npm run verify:full`. Mong đợi: đúng số test như mốc, toàn bộ xanh, không sửa e2e nào.
- [ ] **Step 4:** Commit `giao-dien: tách Editor thành hook lưu/chạy và các khung bố cục`.

### Task 2: Máy chủ — kiểm phiên bản khi lưu, nhóm tính cả thứ tự clip, ước tính trả cảnh báo đạo diễn

**Files:**
- Modify:
  - `src/shared/api.ts`: `SaveWorkflowBodySchema` thêm `baseUpdatedAt?: number`; `EstimateResponse` thêm `warnings: { nodeId: string; message: string }[]`.
  - `src/features/workflows/routes.ts`: PUT.
  - `src/shared/scenes.ts`: `snapshotGroup`.
  - `src/core/estimate.ts`: cảnh báo; lỗi không phải `GraphError`.
  - `src/nodes/film-combine/definition.ts`: trả cảnh báo kèm `nodeId` (dùng chung `scenesFeeding`).
  - `DEBT.md`: N-016 chuyển sang "Đã trả".
  - `FEATURE_MAP.md`.
- Test: `tests/api.test.ts`, `src/shared/scenes.test.ts`, `src/core/estimate.test.ts`.

**Interfaces:**
- Produces:
  - PUT `/api/workflows/:id` có `baseUpdatedAt` mà khác `updatedAt` đang lưu → 409, thân `{ error: "Workflow vừa được cập nhật ở nơi khác (vd Biên kịch tạo lại thẻ cảnh) — đã tải bản mới", workflow: WorkflowResponse }`. Thiếu `baseUpdatedAt` thì chạy như cũ (để test và các script cũ không vỡ).
  - `api.saveWorkflow` nhận 409 thì trả lỗi có kèm `workflow`. `use-workflow.ts` khi gặp 409 thì `applyGraph(workflow.graph)` và hiện lỗi đó trên thanh báo.
  - `snapshotGroup` tính cả `params.order` của Ghép phim mà nhóm cắm vào.
  - `estimate` trả `warnings` (luật 30° và các cảnh báo khác của `checkShotList`), mỗi cảnh báo gắn đúng mã node cảnh.
  - Lỗi không phải `GraphError` trong `estimateRun` → 400, lời tiếng Việt, không trả 500.

- [ ] **Step 1: Viết test hỏng:**
  - `"PUT với baseUpdatedAt cũ → 409 kèm workflow mới; đúng baseUpdatedAt → 200"`.
  - `"đổi order của Ghép phim → groupEdited true; kéo node → vẫn false"`.
  - `"ước tính Sơn La: warnings rỗng; hai cảnh liền nhau cùng góc/cỡ → warnings có cảnh báo 30° gắn mã cảnh sau"`.
  - `"ước tính khi rebuildWriterGroup ném lỗi → 400 có lời báo"`.
- [ ] **Step 2:** Chạy `npx vitest run tests/api.test.ts src/shared src/core/estimate.test.ts`. Mong đợi: hỏng.
- [ ] **Step 3:** Làm theo phần Interfaces. `use-workflow.ts` gửi `baseUpdatedAt` = `updatedAt` của lần tải hoặc lưu gần nhất.
- [ ] **Step 4:** Chạy `npm run verify:full`. Mong đợi: xanh.
- [ ] **Step 5:** Commit `luu: kiểm phiên bản khi lưu workflow, nhóm cảnh tính thứ tự clip, ước tính trả cảnh báo đạo diễn`.

### Task 3: Thẻ node và khung bên phải

**Files:**
- Create:
  - `src/features/editor/ui/NodeCard.tsx`
  - `src/features/editor/ui/Inspector.tsx`
  - `src/features/editor/ui/prompt-preview.ts`: dựng "Prompt gửi Muse" cho Cảnh, bằng `src/shared/shot-plan.ts` / `prompts.ts`.
- Modify:
  - `GraphNode.tsx`: thân node là `NodeCard`; bỏ hẳn `View` khỏi canvas.
  - `src/shared/node-definition.ts`: `cardLine?(params: P, output?: NodeOutputs): string`.
  - Chuyển `labelOf` từ `src/core/node-label.ts` sang `src/shared/node-label.ts`. Phía core import lại từ đó. Lý do: giao diện không được import code máy chủ (khoá ESLint #5).
  - Các `definition.ts`: thêm `cardLine`. Cảnh: "MS · cắt · <chuyển động rút gọn>"; Biên kịch: "12 cảnh · 6 đồ vật"; Ghép phim: "59,8 giây · 12 clip"; v.v.
  - `src/nodes/prompt/view.tsx`: không cần đổi; nháy đúp sửa chữ nằm trong `NodeCard`.
  - `styles.css`.
  - `FEATURE_MAP.md`.

**Interfaces:**
- Consumes: `useRun().nodeStates`, `useWorkflow().setParams` (Task 1).
- Produces:
  - `NodeCard({ id, type, params, state, selected })`. Hiện theo thứ tự ưu tiên:
    - `video` → khung video có poster.
    - `image` (Cảnh: `frame`) → ảnh 16:9.
    - `imageset` → lưới 2×2.
    - `props` → lưới ảnh nhỏ.
    - `text` → tối đa 5 dòng chữ.
    - Không có kết quả → ô trống có biểu tượng của loại node.
  - Nhãn nổi phía trên thẻ: biểu tượng, `definition.label` hoặc `labelOf` ("Cảnh 3"), trạng thái. Kéo nhãn để di chuyển node.
  - Chân thẻ một dòng: `cardLine`, thời lượng.
  - Rê chuột: hiện nút ▶ (`data-testid=card-run-<id>`; Task 6 nối vào lệnh chạy) và tên cổng.
  - Thu nhỏ: `useStore((s) => s.transform[2])` dưới 0.45 thì chỉ hiện ảnh và tên.
  - `Inspector({ nodeId })`:
    - Tab "Thông số": render `webNodes[type].View`, dùng đúng các testid cũ.
    - Tab "Kết quả": media của lần chạy mới nhất, kèm thông báo/lỗi đầy đủ.
    - Tab "Prompt gửi Muse": chỉ đọc. Có cho Cảnh (cắt / nối / chữ→video) và Biên kịch. Node khác ghi "Prompt được tạo khi chạy".
    - Chọn node thì khung mở; bỏ chọn (Escape hoặc bấm nền) thì đóng.
  - Testid mới: `inspector`, `inspector-tab-params`, `inspector-tab-result`, `inspector-tab-prompt`, `card-<id>`, `card-run-<id>`, `card-label-<id>`.

- [ ] **Step 1:** Sửa e2e trước. Mọi chỗ gõ vào ô của node (`prompt-text-…`, `scene-motion-…`, `provider-select-…`, `writer-idea-…`) thêm bước `page.getByTestId("card-<id>").click()` trước. Thêm e2e `e2e/the-anh.spec.ts`:
  - `"thẻ không có ô nhập"`: trong mọi `.react-flow__node`, số `input, textarea, select` bằng 0, trừ thẻ Prompt khi đang nháy đúp.
  - `"chọn thẻ Cảnh → khung phải có ô chuyển động; sửa → Đã lưu; bỏ chọn → khung đóng"`.
  - `"tab Prompt gửi Muse của Cảnh có chữ 'không nhìn vào máy quay'"`.
- [ ] **Step 2:** Chạy `npx playwright test`. Mong đợi: hỏng.
- [ ] **Step 3:** Làm theo phần Interfaces. CSS theo bản phác: thẻ bo góc 14px, nhãn cách trên 22px, viền xanh khi chọn, viền vàng khi đang chạy, viền đỏ khi lỗi.
- [ ] **Step 4:** Chạy `npm run verify:full`. Mong đợi: xanh.
- [ ] **Step 5:** Commit `giao-dien: thẻ node không có form, khung bên phải sửa thông số, xem kết quả và prompt gửi Muse`.

### Task 4: Khung nhóm Phân cảnh và dây gộp

**Files:**
- Create:
  - `src/features/editor/ui/groups.ts`: hàm thuần.
  - `src/features/editor/ui/GroupFrame.tsx`.
- Modify: `Editor.tsx` / `use-workflow.ts` (node khung, kéo nhóm), `styles.css`, `FEATURE_MAP.md`.
- Test: `src/features/editor/ui/groups.test.ts`, e2e.

**Interfaces:**
- Produces:
  - `groupFrames(nodes: FlowNode[], groups: WorkflowGroup[], measured: (id) => {w,h}): FlowNode[]`: mỗi nhóm một node `type: "group-frame"`, id `frame-<groupId>`, bao quanh các thẻ thành viên, đệm 30px, tiêu đề cao 40px, `zIndex: -1`, `selectable: true`, `deletable: false`. Không bao giờ được đưa vào `fromFlow`.
  - `bundleEdges(edges: Edge[], groups: WorkflowGroup[]): { visible: Edge[]; bundled: Edge[] }`: dây từ một nguồn ngoài nhóm vào ≥2 node trong cùng nhóm, cùng `sourceHandle`, gộp thành một dây hiển thị tới cổng ở mép khung (`frame-<groupId>`, handle `in-<kind>`). Dây gốc vẫn giữ trong dữ liệu.
  - `moveGroup(nodes, groupId, dx, dy): FlowNode[]`.
  - Tiêu đề khung: "▢ Phân cảnh · 12 cảnh · 59,8 giây". Dòng kiểm luật lấy từ `estimate.warnings` (Task 2; Task 7 gọi estimate): "✓ Luật đạo diễn đạt", hoặc danh sách cảnh báo.
  - Lệnh "Nhóm" (Ctrl+G / menu) tạo nhóm tay từ các node đang chọn (`groups` thêm mục không có `source`). Testid: `group-<groupId>`, `group-title-<groupId>`.

- [ ] **Step 1: Viết test hỏng:**
  - `groups.test.ts`:
    - `"Sơn La: 1 khung bao 12 cảnh"`.
    - `"36 dây tham chiếu → 3 dây gộp hiển thị, 36 dây gốc giữ nguyên"`.
    - `"dây follow trong nhóm không bị gộp"`.
    - `"moveGroup dời cả 12 cảnh"`.
    - `"fromFlow không chứa group-frame"`.
  - e2e: `"kéo tiêu đề nhóm 200px → cả 12 thẻ dời, lưu, chạy lại không ra decision"`.
- [ ] **Step 2:** Chạy test. Mong đợi: hỏng.
- [ ] **Step 3:** Làm theo phần Interfaces.
- [ ] **Step 4:** Chạy `npm run verify:full`. Mong đợi: xanh.
- [ ] **Step 5:** Commit `giao-dien: khung nhóm Phân cảnh, dây gộp vào mép nhóm, kéo cả nhóm, nhóm tay`.

### Task 5: Ô tìm node và thả dây ra chỗ trống

**Files:**
- Create:
  - `src/features/editor/ui/Spotlight.tsx`
  - `src/features/editor/ui/catalog.ts`: hàm thuần.
- Modify: `Editor.tsx` (`onConnectEnd` khi thả ra chỗ trống), `Rail.tsx` (nút +), `styles.css`, `FEATURE_MAP.md`.
- Test: `src/features/editor/ui/catalog.test.ts`, e2e.

**Interfaces:**
- Consumes: `placeNewNode`, `inheritProvider` (đã có), `replaceTargetEdges`, `targetAcceptsMany`.
- Produces:
  - `catalogItems(): CatalogItem[]`, với `CatalogItem = { key; category; icon; label; description; nodeType?; template?; asset?; tag: "have" }`. Lấy từ `webNodes`, bỏ node `hidden`. Có thêm:
    - mục Mẫu: `WORKFLOW_TEMPLATES`;
    - mục Kho: `api.listAssets`, chọn vào thì tạo node nhân vật / bối cảnh / đồ vật bằng `replaceParams` với tham số của mục kho.
  - Nhóm theo spec 8.3: Gần đây, Cơ bản, Nguồn & kho, Tham chiếu, Tạo video, Chữ & AI, Xử lý video, Mẫu. Nhóm không có mục thì ẩn.
  - "Gần đây" lưu trong `localStorage`, khoá `videopic.spotlight.recent`, tối đa 6 mục, bọc try/catch có báo lỗi ra console.
  - `filterByPort(items, { kind, dir }): CatalogItem[]`: chỉ giữ node có cổng vào loại `kind` (khi kéo từ cổng ra) hoặc cổng ra loại `kind` (khi kéo từ cổng vào).
  - `Spotlight({ at?: {x,y} /*toạ độ màn hình*/, filter?, onPick })`:
    - mở bằng phím `/` hoặc Space (khi không đang gõ), nút + ở thanh trái, menu chỗ trống "Thêm node ở đây";
    - gõ để lọc, ↑↓ để chọn, Enter để thêm, Esc để đóng.
  - Thả dây ra chỗ trống → mở Spotlight lọc theo cổng, ngay tại chỗ thả. Chọn xong thì node mới đặt ở chỗ thả và nối dây sẵn (thay dây cũ nếu cổng vào không phải `multiple`).
  - Testid: `spotlight`, `spotlight-input`, `spotlight-filter`, `spotlight-item-<key>`, `spotlight-cat-<category>`, `rail-add`.

- [ ] **Step 1: Viết test hỏng:**
  - `catalog.test.ts`:
    - `"không có film/shotlist"`.
    - `"lọc kind video dir out → có Cảnh (Nối tiếp), Ghép phim; không có Nhân vật"`.
    - `"lọc kind imageset dir in → có Nhân vật, Bối cảnh"`.
  - e2e:
    - `"phím / → gõ 'cảnh' → Enter → có node Cảnh giữa màn hình, được chọn"`.
    - `"kéo từ cổng Clip của Cảnh 12 ra chỗ trống → ô tìm chỉ có node nhận Video → chọn Ghép phim → node mới ở chỗ thả, có dây"`.
- [ ] **Step 2:** Chạy test. Mong đợi: hỏng.
- [ ] **Step 3:** Làm theo phần Interfaces.
- [ ] **Step 4:** Chạy `npm run verify:full`. Mong đợi: xanh.
- [ ] **Step 5:** Commit `giao-dien: ô tìm node, thả dây ra chỗ trống thêm node hợp loại và nối sẵn`.

### Task 6: Menu chuột phải, chạy một phần, chạy lại bản mới, nhân bản, phím tắt

**Files:**
- Create:
  - `src/features/editor/ui/ContextMenu.tsx`
  - `src/features/editor/ui/shortcuts.ts`: bảng phím, hàm thuần `actionFor(e: KeyboardEvent, typing: boolean)`.
  - `src/features/editor/ui/ShortcutSheet.tsx`
- Modify: `Editor.tsx`, `NodeCard.tsx` (nút ▶), `FEATURE_MAP.md`.
- Test: `src/features/editor/ui/shortcuts.test.ts`, e2e.

**Interfaces:**
- Consumes: `useRun().startRun(scope)` (Task 1), `confirmAndRun` (Task 7). Task 6 gọi thẳng `startRun`; Task 7 chèn hộp xác nhận vào giữa.
- Produces:
  - Menu trên node:
    - "▶ Chạy node này" (`{mode:"node", nodeId}`);
    - "▶▶ Chạy từ đây trở đi" (`downstream`);
    - "↻ Chạy lại (bản mới)": chỉ hiện với node có `take` trong schema tham số; tăng `take` thêm 1, lưu, rồi chạy `node`;
    - "⧉ Nhân bản" (Ctrl+D; mã mới, lệch 40px, không kèm dây);
    - "▢ Nhóm" (Ctrl+G);
    - "🗑 Xoá" (Delete).
  - Menu chỗ trống: "＋ Thêm node ở đây", "⤢ Vừa màn hình" (F).
  - Các lệnh khác trong spec 8.4 (kéo dài video, lấy khung cuối, khoá, tải file, lưu mẫu, dán, tự xếp) **không hiện** trong 1B.
  - `actionFor`:
    - `/` và Space → spotlight;
    - Ctrl+Enter → chạy cả workflow;
    - Shift+Enter → chạy node đang chọn;
    - Ctrl+D → nhân bản;
    - Ctrl+G → nhóm;
    - F → vừa màn hình;
    - ? → bảng phím tắt;
    - Esc → bỏ chọn / đóng.
    - `typing=true` (đang gõ trong input/textarea/select) → `null`, trừ Esc.
  - Testid: `context-menu`, `ctx-run-node`, `ctx-run-downstream`, `ctx-rerun`, `ctx-duplicate`, `ctx-group`, `ctx-delete`, `ctx-add-here`, `ctx-fit`, `shortcut-sheet`.

- [ ] **Step 1: Viết test hỏng:**
  - `shortcuts.test.ts`: một test cho mỗi phím, kèm `"đang gõ thì / không mở ô tìm"`.
  - e2e:
    - `"chuột phải Cảnh 3 → Chạy node này → chỉ Cảnh 3 và node phía trước có trạng thái mới"`.
    - `"Chạy lại (bản mới) → take của Cảnh 3 = 2, dịch vụ giả gọi thêm 1 video"`.
    - `"Ctrl+D nhân bản node Prompt"`.
- [ ] **Step 2:** Chạy test. Mong đợi: hỏng.
- [ ] **Step 3:** Làm theo phần Interfaces.
- [ ] **Step 4:** Chạy `npm run verify:full`. Mong đợi: xanh.
- [ ] **Step 5:** Commit `giao-dien: menu chuột phải, chạy một node/từ đây, chạy lại bản mới, nhân bản, phím tắt`.

### Task 7: Ước tính lượt, hộp xác nhận, ô hàng chờ, minimap

**Files:**
- Create:
  - `src/features/editor/ui/RunConfirm.tsx`
  - `src/features/editor/ui/use-estimate.ts`
  - `src/features/editor/ui/QueuePanel.tsx`: viết thật.
- Modify: `TopBar.tsx`, `Editor.tsx` (`MiniMap`, `Controls`), `NodeCard.tsx`, `FEATURE_MAP.md`.
- Test: `src/features/editor/ui/estimate-view.test.ts`, e2e.

**Interfaces:**
- Consumes: `api.estimate(id, scope)`, `useRun`.
- Produces:
  - `useEstimate(workflowId, saveState)`: gọi `estimate` (scope all) 1 giây sau mỗi lần "Đã lưu", và sau mỗi lượt chạy. Kết quả dùng cho ô "Lần chạy tới" ở thanh trên.
  - `estimateText(e: EstimateResponse): string`:
    - `"<a> ảnh + <v> video + <t> chữ Muse"`, bỏ phần bằng 0; tất cả bằng 0 thì `"0 lượt Muse (dùng lại hết)"`;
    - có node `unknown` thì thêm `" + chưa biết (<n> node)"`;
    - `waitsOnWriter` thì thêm `" — số cảnh chưa biết đến khi Biên kịch viết xong"`.
  - `confirmAndRun(scope)`:
    - luôn hỏi với "Chạy cả workflow";
    - với `node` / `downstream`: chỉ hỏi khi `museTotal` > 0 hoặc có node `unknown`.
    - Bảng hỏi liệt kê từng node: "dùng lại" / "sẽ gọi Muse: …" / "chưa biết". Nút "▶ Chạy" và "Huỷ".
  - `QueuePanel`: khi đang chạy, liệt kê node `running` với `message` (đã ghi bước và hồ sơ Muse), số node xong/tổng, nút huỷ (`cancel-run` chuyển vào đây). Khi rảnh: "Lần chạy trước: …".
  - `MiniMap` và `Controls` của @xyflow/react ở góc dưới phải.
  - Testid: `estimate-pill`, `run-confirm`, `run-confirm-row-<id>`, `run-confirm-ok`, `run-confirm-cancel`, `queue-panel`, `minimap`.

- [ ] **Step 1: Viết test hỏng:**
  - `estimate-view.test.ts`:
    - `"0 → '0 lượt Muse (dùng lại hết)'"`.
    - `"{image:1, video:2} + 1 unknown → '1 ảnh + 2 video Muse + chưa biết (1 node)'"`.
    - `"waitsOnWriter"`.
  - e2e:
    - `"bấm Chạy cả workflow → hộp xác nhận → Huỷ → không có lượt chạy"`.
    - `"chạy node Prompt (0 lượt) không hỏi"`.
    - `"đang chạy: ô hàng chờ có ít nhất 1 dòng; bấm huỷ → Lỗi Đã huỷ"`.
- [ ] **Step 2:** Chạy test. Mong đợi: hỏng.
- [ ] **Step 3:** Làm theo phần Interfaces. Nút "▶ Chạy" ở thanh trên và phím Ctrl+Enter đều đi qua `confirmAndRun`.
- [ ] **Step 4:** Chạy `npm run verify:full`. Mong đợi: xanh.
- [ ] **Step 5:** Commit `giao-dien: ước tính lượt ở thanh trên, hộp xác nhận trước khi chạy, ô hàng chờ, minimap`.

### Task 8: Dải thứ tự clip ở Ghép phim, kết quả cũ sau Tạo thẻ cảnh / Thay / Giữ

**Files:**
- Modify:
  - `src/nodes/film-combine/view.tsx`: dải ảnh nhỏ, kéo thả bằng HTML5 drag & drop thuần.
  - `use-run.ts`: xoá kết quả cũ của thẻ cảnh bị thay.
  - `FEATURE_MAP.md`.
- Test: e2e.

**Interfaces:**
- Produces:
  - Dải thứ tự: mỗi clip nối vào là một ảnh nhỏ (khung đầu của cảnh nếu có, không thì ô "clip"), theo `orderSources` (thứ tự hiện hành). Kéo thả ghi `params.order` (mảng mã node nguồn). Testid: `order-strip-<id>`, `order-item-<id>-<sourceId>`.
  - Sau `expandScenes` (Tạo thẻ cảnh / Thay / Giữ): thẻ cảnh có tham số khác bản đồ thị của lượt chạy cuối thì bỏ kết quả hiển thị, hiện "Chưa chạy" cho tới lần chạy sau.

- [ ] **Step 1: Viết test hỏng (e2e):**
  - `"kéo clip 12 lên đầu → params.order đổi, ước tính ghi Ghép phim sẽ chạy lại (0 lượt Muse); đổi tiếp ý tưởng Biên kịch rồi chạy → ra decision scenes-edited (thứ tự sửa tay được tính là sửa nhóm), 0 video"`.
  - `"Tạo thẻ cảnh lại với Biên kịch đổi số cảnh → thẻ mới hiện Chưa chạy"`.
- [ ] **Step 2:** Chạy test. Mong đợi: hỏng.
- [ ] **Step 3:** Làm theo phần Interfaces.
- [ ] **Step 4:** Chạy `npm run verify:full`. Mong đợi: xanh.
- [ ] **Step 5:** Commit `giao-dien: dải thứ tự clip ở Ghép phim, bỏ kết quả cũ của thẻ cảnh vừa thay`.

### Task 9: Hiệu năng, bản đồ, chạy thử trên app thật, PR

- [ ] **Step 1: Đo hiệu năng.** Thêm e2e `e2e/hieu-nang.spec.ts`:
  - dựng workflow 30 node (2 nhóm 12 cảnh qua `expandScenes` với dịch vụ giả);
  - đo thời gian 20 lần `mouse.move` kéo nền và 10 lần cuộn phóng to, bằng `performance.now()` trong trang;
  - mong đợi: trung bình mỗi khung dưới 50 ms trên máy chủ dự án.
  - Ghi kết quả vào PR. Không đạt thì bật `onlyRenderVisibleElements` của React Flow và dùng `memo` cho `NodeCard`.
- [ ] **Step 2:** Rà `FEATURE_MAP.md`: thêm mục "Luồng 5 — Canvas thẻ ảnh", liệt kê mọi testid mới; khoá kiến trúc phải xanh.
- [ ] **Step 3:** Chạy `npm run verify:full`. Mong đợi: xanh.
- [ ] **Step 4 (controller, máy chủ không watch, dữ liệu thật, không gọi Muse):** mở workflow Sơn La và kiểm:
  - canvas giống bản phác: 12 thẻ có ảnh trong khung nhóm, dây gộp;
  - chọn Cảnh 3 → khung phải;
  - chuột phải → menu;
  - phím `/` → ô tìm;
  - ô "Lần chạy tới: 0 lượt Muse";
  - chụp màn hình gửi chủ dự án.
- [ ] **Step 5:** Push nhánh `canvas-dot-1b`, mở PR. CI xanh thì gộp (`CLAUDE.md` mục 6A).

## Ngoài phạm vi 1B (để Đợt 2 hoặc sổ nợ)

- Xem và chọn lại bản cũ "‹ 2/3 ›".
- Hoàn tác / làm lại, copy/paste.
- Node Tải ảnh/video lên, Lấy khung hình, Kéo dài video, Ghi chú dán, Xuất file.
- Tab nhiều workflow, đổi tên, xoá, nhân bản workflow; lưu làm mẫu.
- Gắn lỗi kiểm luật lúc Biên kịch vừa tạo lại nhóm vào thẻ cảnh: thẻ mới chưa được lưu.
- Cho Nhân vật / Bối cảnh / Đồ vật / Biên kịch / Tạo video đi qua `ctx.shared.slot` và cầu dao (việc máy chủ, không thuộc giao diện).
- Lỗi chung chung khi tạo lại nhóm làm mất node của `scope.nodeId`.
