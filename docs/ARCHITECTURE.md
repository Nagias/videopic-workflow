# Kiến trúc — VideoPic Workflow

Tài liệu thiết kế gốc (spec). Chủ dự án duyệt kiến trúc ngày 27/10/2026 trong chat. Mục đích dự án và các quyết định tư duy ở `CLAUDE.md` (nguyên văn); file này là phần "làm thế nào".

## 1. Sản phẩm là gì

App chạy trên máy Windows của chủ dự án, mở bằng trình duyệt ở `http://127.0.0.1:5190`. Người dùng kéo nối các node trên một canvas (giống ComfyUI / Magnific Spaces / Higgsfield), viết prompt ngay trên node, chọn dịch vụ tạo video (Muse thật hoặc bản giả để thử), bấm **Chạy**. Kết quả từng node (clip, ảnh, khung hình) lưu trên ổ D và hiện ngay trên node.

Đích xa: chuỗi clip 5–10 giây của Muse nối tiếp nhau giữ nguyên mặt người, sản phẩm, không gian; video ngắn khoảng 2 phút trước (kênh review / giải trí bán hàng), video dài 10–60 phút sau.

## 2. Công nghệ (và vì sao)

| Phần | Chọn | Hệ quả vận hành |
|---|---|---|
| Ngôn ngữ | TypeScript 6.0 strict, mọi nơi | Một bộ kiểu dữ liệu dùng chung giao diện ↔ máy chủ ↔ node. Sửa cấu trúc node một chỗ, chỗ dùng sai báo lỗi ngay khi typecheck. TS 7 chưa dùng vì typescript-eslint chỉ hỗ trợ < 6.1 |
| Canvas | React 19 + Vite + @xyflow/react (React Flow) | Thư viện node editor phổ biến nhất, nhiều ví dụ |
| Máy chủ | Fastify 5 + zod 4 | Dữ liệu sai bị chặn ở cửa API |
| Lưu trữ | SQLite một file (`.data/app.db`) qua Drizzle + better-sqlite3 | Không cài Postgres/Redis; migration sinh tự động |
| Hàng đợi | Bảng `runs` trong SQLite + một worker trong tiến trình máy chủ | Tắt máy giữa chừng: lần mở sau chạy tiếp, node đã xong không chạy lại |
| Video | ffmpeg/ffprobe trên máy (PATH), gọi qua `src/core/ffmpeg.ts` | Một đường duy nhất để cắt khung, kiểm clip, ghép |
| Muse | Playwright điều khiển Chrome đã cài, hồ sơ riêng `.data/chrome_profiles/muse_vid_0N` | Chuyển từ `muse_fleet_runner.py` của Story Studio (đã chạy thật) |
| Test | Vitest (đơn vị, tích hợp, kiến trúc) + Playwright Test (bấm thật trên giao diện) | Dịch vụ giả (`fake`) sinh clip bằng ffmpeg → CI chạy cả luồng, không tốn lượt Muse |

## 3. Cấu trúc thư mục (theo tính năng)

```
src/
  core/                 # hạ tầng máy chủ, ít đổi
    config.ts           # NƠI DUY NHẤT đọc process.env
    db/                 # schema.ts, client.ts, migrations/
    storage.ts          # NƠI DUY NHẤT ghi file media vào .data/media
    ffmpeg.ts           # NƠI DUY NHẤT chạy ffmpeg/ffprobe
    executor.ts         # chạy đồ thị: node đủ nguồn chạy song song, phạm vi chạy (RunScope), cache theo khoá băm
    run-shared.ts       # đồ dùng chung trong lần chạy: chỗ chạy theo dịch vụ, khoá chat, chat mới nhất, cầu dao
    queue.ts            # nhận run, worker, huỷ run, chạy tiếp sau khi tắt máy (giữ phạm vi đã lưu)
  shared/               # dùng chung giao diện + máy chủ (không import gì của node:*)
    workflow.ts         # schema đồ thị (zod)
    ports.ts            # kiểu dữ liệu chảy qua dây nối
    api.ts              # schema request/response
  nodes/<loại-node>/    # MỖI loại node một thư mục — giống ComfyUI
    definition.ts       # tên, cổng vào/ra, tham số (zod) — dùng chung
    run.ts              # chạy trên máy chủ
    view.tsx            # hiển thị trên canvas
    node.test.ts
  nodes/registry.server.ts, registry.web.ts   # SINH TỰ ĐỘNG bằng `npm run gen:nodes`, cấm sửa tay
  providers/<tên>/      # MỖI dịch vụ AI một thư mục: fake/, muse/
  providers/types.ts    # giao diện VideoProvider
  features/<tính-năng>/ # lát dọc: routes.ts (+ service.ts) phía máy chủ, ui/ phía giao diện
  app/                  # vỏ giao diện: main.tsx, App.tsx, api-client.ts (NƠI DUY NHẤT gọi fetch)
  server.ts             # điểm chạy máy chủ
e2e/                    # Playwright Test
tests/                  # test kiến trúc (khoá cứng) và test xuyên tính năng
scripts/                # gen-nodes, new-node, muse-login, smoke-muse
.data/                  # KHÔNG lên git: app.db, media/, chrome_profiles/
```

## 4. Mô hình workflow (học từ ComfyUI, tự viết lại)

- Đồ thị lưu dạng JSON theo đúng hình dạng React Flow: `{ nodes: [{ id, type, position, params }], edges: [{ id, source, sourceHandle, target, targetHandle }] }`, kiểm bằng zod (`src/shared/workflow.ts`).
- Mỗi cổng có kiểu (`text`, `video`, sau này `image`, `shotlist`). Nối sai kiểu bị chặn cả trên canvas lẫn khi chạy.
- **Khoá băm (cache key)** mỗi node = sha256(loại node + tham số + khoá băm các node phía trên). Node đã có kết quả với cùng khoá thì **dùng lại, không gọi Muse lần nữa**. Chỉ sửa thứ phía trên thì phía dưới mới chạy lại.
- Kết quả node lưu trong SQLite (`run_nodes`), file nằm trong `.data/media`. Worker chết giữa chừng: run đang `running` được đưa lại hàng đợi lúc khởi động, node đã xong lấy từ cache.

## 5. Dịch vụ tạo video (provider)

```ts
interface VideoProvider {
  id: string
  label: string
  generateVideo(req: VideoRequest, ctx: ProviderContext): Promise<GeneratedVideo>
}
```

- `fake`: ffmpeg tạo clip màu (màu suy từ prompt) có tiếng, đúng thời lượng. Dùng cho test và CI.
- `muse`: Playwright mở hồ sơ Chrome đã đăng nhập → chat mới → (đính kèm ảnh) → gửi prompt → chỉ nhận media **mới** xuất hiện sau khi gửi → tải về → kiểm bằng ffprobe → trả file. Mỗi hồ sơ chỉ chạy một việc một lúc; hồ sơ hết phiên đăng nhập bị đánh dấu `needs_login` và bỏ qua.
- Test không được gọi Muse thật: `muse` từ chối chạy khi `APP_ENV=test` trừ khi `MUSE_LIVE=1`.

## 6. Giữ nhân vật / sản phẩm / không gian (cho các tính năng sau)

Công thức rút từ ComfyUI, Magnific, Higgsfield, Kling, Google Flow và số đo thật của Story Studio (27/10/2026):

1. Bộ hồ sơ gốc: người 4 góc, sản phẩm 3–4 góc nền trơn, bối cảnh trống, một ảnh chốt màu/ánh sáng.
2. Ảnh khung trước (lưới 9 ô của Muse rất đồng nhất), video sau.
3. Clip nào cũng gắn lại hồ sơ gốc, không chỉ khung cuối clip trước.
4. Nối khung cuối → khung đầu tối đa 2–3 lần, sau đó cắt sang góc khác.
5. Hậu kỳ: chỉnh màu về ảnh gốc (Muse làm khung cuối tối hơn 42–57%), lấy khung cuối lùi vài khung, cắt khung trùng ở mối nối.
6. Clip 5 giây giữ mặt tốt hơn clip 10 giây (Story Studio đo: méo mặt sau ~1,5 giây ở clip 10 giây).
7. Kiến thức đạo diễn ghi thành dữ liệu: cỡ cảnh, chuyển động máy, luật 180°, luật 30°, khuôn quảng cáo.

### 6.1 Giới hạn Muse đo thật (27/10/2026) — thay đổi cách giữ mặt

- **Chưa chắc chắn:** Muse từ chối **1 lần** tạo ảnh chân thực có đính kèm ảnh người (vid_03, ảnh nghiêng 3/4; câu trả lời gợi ý "không dựa trên ảnh tham chiếu" hoặc "minh hoạ"). Chủ dự án dùng Muse thường chỉ gặp báo lỗi máy chủ video, không gặp từ chối kiểu này → một lần chưa đủ kết luận là chính sách; sẽ thử lại. Đính kèm ảnh người được giữ làm **đường dự phòng** khi chat phụ của nhân vật hỏng.
- Muse **giữ mặt rất tốt khi tạo ảnh nối tiếp trong cùng một đoạn chat**, không tải lên ("chính cô gái trong ảnh bạn đã tạo trước đó"). → Cách đang dùng (chủ dự án chọn 27/10/2026): **một chat phụ cho một nhân vật** — ảnh chân dung → các góc → ảnh khung từng cảnh có nhân vật nối tiếp trong chat đó (tuần tự, một tài khoản). Luôn dùng chat phụ, không dùng chat chính; chat phụ không tạo được → mở chat phụ mới thử lại (lần thử lại của nhân vật đính kèm ảnh chân dung).
- Tạo video tối 27/10 thất bại trên cả 3 tài khoản (chữ→video lẫn ảnh→video, có người lẫn không người); cùng ngày 21:55 chữ→video vẫn thành công. Chưa kết luận được ảnh→video có bị chặn với người chân thực hay không — cần thử lại khi Muse ổn định.

### 6.2 Chống "nhựa" và cảnh sạn (28/10/2026, thiết kế `docs/superpowers/specs/2026-10-28-chat-luong-video-design.md`)

- Mọi prompt Muse của luồng phim ở **một file** `src/shared/prompts.ts` (tiếng Việt, gửi nguyên văn `verbatim`). Không dùng "cinematic/photorealistic/2K"; một câu **tông ảnh** chốt ở node Không gian (mặc định "ảnh điện thoại như khung hình vlog, trời hơi âm u, màu không chỉnh") đi vào mọi ảnh và video.
- Cảnh v2 (`src/shared/director.ts`): **khung đầu** (ảnh đứng yên) + **chuyển động** (chỉ việc xảy ra sau khung đầu) + **đồ vật trong khung** (`tên: trạng thái đầu -> trạng thái cuối`). `checkShotList()` chặn: đồ vật xuất hiện lại sai trạng thái, đồ vật đổi trạng thái mà không có người/tay tác động, tên/trạng thái không có trong node Đồ vật.
- Đường tạo cảnh (`src/nodes/film/run.ts`): nối → khung cuối; có người/tay → ảnh khung trong chat phụ của nhân vật, đính kèm bối cảnh + tối đa 2 ảnh mẫu đồ vật đúng trạng thái đầu; không người có đồ vật → ảnh khung chat mới; không người không đồ vật → **chữ→video thẳng**.
- Ảnh mẫu: nhân vật 4 góc (mặt cận, chính diện, nghiêng, sau lưng), không gian 2 ảnh, node **Đồ vật** (ảnh tĩnh vật + từng trạng thái tạo nối tiếp trong cùng chat). Bước con khoá theo mô tả món → món giống hệt ở workflow khác không tốn lượt.
- **Kho tài sản** (bảng `assets`, ghi duy nhất ở `src/features/assets/store.ts`): executor ghi khi node có `definition.library` chạy xong; giao diện "Dùng lại từ kho" điền lại tham số → trúng cache.
- **Biên kịch** (`src/nodes/writer/`): chat Muse viết JSON danh sách cảnh + đồ vật theo luật ViMax; `parseWriterReply()` kiểm bằng đúng `checkShotList()`; sai thì gửi lỗi sửa trong cùng chat (tối đa 3 lần). Muse đọc câu trả lời chữ: chờ chữ đứng yên 3 lần quét, cắt sau mã đánh dấu cuối prompt.
- Ghép phim nén **một lần** (x264 medium, CRF 17), bù sáng áp ngay trong lần nén đó.

## 7. Lộ trình

1. Bộ khung đi được: Prompt → Tạo video (Muse) → xem clip. (xong)
2. Video ngắn đến ~2 phút: hồ sơ gốc, ảnh khung, chuỗi clip, chỉnh màu, ghép. (xong 28/10)
3. Biên kịch viết danh sách cảnh bằng chính khung chat Muse; ảnh mẫu đồ vật; kho tài sản. (xong 28/10)
4. Video dài 10–60 phút.

## 8. Nguồn mượn

| Mượn | Từ | Ghi chú |
|---|---|---|
| Thao tác Muse (selector, chat mới, nhận media mới, kiểm clip) | Story Studio `backend/runners/muse_fleet_runner.py` | code của chủ dự án |
| Khuôn bộ điều khiển Muse + bản giả | github.com/www222fff/muse2api | MIT |
| Giao diện provider | github.com/siri2moon/moonreel | MIT |
| Luật chia cảnh khung đầu / chuyển động, cảnh đầu rộng nhất, gọi nhân vật bằng đặc điểm (prompt Biên kịch, `src/shared/prompts.ts`) | github.com/HKUDS/ViMax | MIT — `NOTICE.md` |
| Bộ ảnh mẫu nhân vật 4 góc, đồ vật tĩnh vật không tay người, trạng thái đồ vật từ ảnh gốc, tông ảnh chốt một lần | github.com/HBAI-Ltd/Toonflow-app | MIT — `NOTICE.md` |
| Biên kịch tự lọc danh sách đồ vật để tạo ảnh mẫu | github.com/chatfire-AI/huobao-drama | CC BY-NC-SA — chỉ học ý tưởng, không chép chữ |
| Workflow JSON, cổng có kiểu, cache theo khoá băm | ComfyUI | học ý tưởng |
| Canvas + khung cuối làm tham chiếu + timeline | github.com/bynne2602/museflow | tham khảo giao diện |

Chủ dự án chỉ dùng cá nhân, không bán, nên giấy phép GPL/phi thương mại không cản việc chép code (27/10/2026).
