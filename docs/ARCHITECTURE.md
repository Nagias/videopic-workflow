# Kiến trúc — VideoPic Workflow

Tài liệu thiết kế gốc (spec). Chủ dự án duyệt kiến trúc ngày 27/10/2026 trong chat. Mục đích dự án và các quyết định tư duy ở `CLAUDE.md` (nguyên văn); file này là phần "làm thế nào".

## 1. Sản phẩm là gì

App chạy trên máy Windows của chủ dự án, mở bằng trình duyệt ở `http://localhost:5173`. Người dùng kéo nối các node trên một canvas (giống ComfyUI / Magnific Spaces / Higgsfield), viết prompt ngay trên node, chọn dịch vụ tạo video (Muse thật hoặc bản giả để thử), bấm **Chạy**. Kết quả từng node (clip, ảnh, khung hình) lưu trên ổ D và hiện ngay trên node.

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
    executor.ts         # chạy đồ thị: thứ tự topo, cache theo khoá băm
    queue.ts            # nhận run, worker, chạy tiếp sau khi tắt máy
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

## 7. Lộ trình

1. Bộ khung đi được: Prompt → Tạo video (Muse) → xem clip. **(đang làm)**
2. Video ngắn đến ~2 phút: hồ sơ gốc, ảnh khung, chuỗi clip, chỉnh màu, ghép.
3. Node Đạo diễn viết danh sách cảnh (thử dùng chính khung chat Muse).
4. Video dài 10–60 phút.

## 8. Nguồn mượn

| Mượn | Từ | Ghi chú |
|---|---|---|
| Thao tác Muse (selector, chat mới, nhận media mới, kiểm clip) | Story Studio `backend/runners/muse_fleet_runner.py` | code của chủ dự án |
| Khuôn bộ điều khiển Muse + bản giả | github.com/www222fff/muse2api | MIT |
| Giao diện provider | github.com/siri2moon/moonreel | MIT |
| Prompt Đạo diễn | github.com/HKUDS/ViMax | MIT, dùng ở tính năng 3 |
| Workflow JSON, cổng có kiểu, cache theo khoá băm | ComfyUI | học ý tưởng |
| Canvas + khung cuối làm tham chiếu + timeline | github.com/bynne2602/museflow | tham khảo giao diện |

Chủ dự án chỉ dùng cá nhân, không bán, nên giấy phép GPL/phi thương mại không cản việc chép code (27/10/2026).
