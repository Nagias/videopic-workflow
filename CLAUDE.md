# VideoPic Workflow — hướng dẫn cho agent

App làm ảnh/video theo workflow kéo-nối node (kiểu ComfyUI / Magnific / Higgsfield), tập trung video bằng Muse, chạy trên máy, giao diện `http://127.0.0.1:5190`.
Đọc file này trước mọi việc. Bản đồ tính năng: `FEATURE_MAP.md`. Sổ nợ có chủ đích: `DEBT.md`. Checklist việc dài: `TASKS.md`. Thiết kế: `docs/ARCHITECTURE.md`.

Cách đọc nhãn:
- **[Nguyên văn chủ dự án]**: lời của chủ dự án. Giữ nguyên từng chữ, không viết lại, không tóm tắt, không suy diễn thêm ý.
- **[Đề xuất của agent — chưa duyệt]**: agent viết để chủ dự án duyệt hoặc sửa. Khi được duyệt, chủ dự án bỏ nhãn.
- Phần không nhãn: sự thật về code hiện tại, kiểm được bằng lệnh hoặc đọc code. Code đổi thì sửa theo.

## 1. Mục đích project

**[Nguyên văn chủ dự án]** (27/10/2026)

> Dự án làm ảnh và video theo workflow giống ComfyUI hoặc Magnific. Tập trung nhiều vào làm video với công cụ là Muse. Kết nối tài khoản dựa vào Playwright trên trình duyệt Chrome hoặc cách khác đề xuất sau. Đặc biệt là các Prompt có mối quan hệ nối tiếp nhau, nhân vật, chủ thể được giữ nguyên theo input đầu vào. Ví dụ người đưa vào thì được giữ nguyên mặt, hoặc không gian thì được giữ nguyên khong thay đổi. Mục đích là Generate các video dài lên tới 10, 20, 30, 60 phút từ số lượng lớn video 10 phút - 1 giới hạn của muse. Các video sau khi xuất ra theo thứ tự lần lượt có thể được ghép nối liên tiếp với nhau. Cảnh cuối của video này là cảnh đầu của video kia. Có thể viết prompt ngay trên luồng workflow và đổi model (cứ tập trung làm giống cách mà Higgfield, ComfyUI, Magnific xử lý là được. Ví dụ giờ tôi muốn làm 1 video khám phá rừng nguyên sinh hoặc sinh tồn 100% bằng AI Muse thì vẫn được. Hoặc ghép 1 nhân vật vào 1 video, hoặc 1 sản phẩm với 1 mẫu...

**[Nguyên văn chủ dự án]** (27/10/2026, về độ dài clip Muse và đích gần)

> Muse độ dài tối đa thì khoảng 10 giây, nhưng ghép nhiều video 10 giây vào thì thành video cả 10, 20, 60 phút vẫn được. Quan trọng là cách prompt để video sau nối tiếp video trước, hoặc là thay đổi góc quay kiểu B-roll, đổi góc... cái này thì cần khả năng hiểu video như 1 đạo diễn mới được. Nên cũng cần update thêm cả kiến thức đạo diễn. Nhưng trước khi đi sâu vào video 10 phút thì tôi cần video khoảng 50 giây để xây kênh review hoặc kênh giải trí AI giúp bán hàng

> số 50 giây chỉ là ví dụ thôi, ý tôi là khoảng tầm max là 2 phút. còn logic thì như tôi nói từ đầu.

**[Nguyên văn chủ dự án]** (27/10/2026, về mã nguồn mở)

> tool này tôi chỉ để dùng thôi nên mấy cái mã nguồn có giấy phép không cho thương mại thi tôi vẫn dùng được mà, vì tôi đâu có bán đâu.

### 1.1 Đối chiếu mục đích với code hiện tại — [Đề xuất của agent — chưa duyệt]

| Ý trong mục đích | Code hiện tại | Khoảng cách |
|---|---|---|
| Workflow kéo-nối node, viết prompt trên node | Canvas React Flow, node Prompt và Tạo video (luồng 1 `FEATURE_MAP.md`) | Mới 2 loại node |
| Đổi model | Node Tạo video chọn dịch vụ `fake` / `muse` (`src/providers/`) | Chưa có dịch vụ thứ ba |
| Kết nối tài khoản Muse bằng Playwright + Chrome | `src/providers/muse/`, hồ sơ `.data/chrome_profiles/muse_vid_0N` | Chưa đính kèm ảnh |
| Giữ mặt người, sản phẩm, không gian | — | Tính năng 2 (`docs/ARCHITECTURE.md` mục 6) |
| Cảnh cuối video này là cảnh đầu video kia, ghép nối | — | Tính năng 2 |
| Video ~2 phút, sau đó 10–60 phút | — | Tính năng 2 và 4 |
| Kiến thức đạo diễn | — | Tính năng 3 |

## 2. Nguyên tắc

Các mục 2.1–2.4 là lời chủ dự án viết cho Story Studio (`D:\25. OPC\OP_CTOOL\projects\story-studio\CLAUDE.md`, 22/10/2026). Chủ dự án yêu cầu dựng CLAUDE.md "như nhánh A" cho dự án này; agent hiểu là theo khuôn đó và chép nguyên văn sang — **[Đề xuất của agent — chưa duyệt]** về việc áp các câu này cho dự án mới.

### 2.1 Thiết kế kiểu Dune — [Nguyên văn chủ dự án]

> Nguyên tắc thiết kế kiểu Dune — đường đúng phải cần ÍT quyết định hơn đường tắt; phụ thuộc/mẫu bị cấm phải làm test hoặc CI báo lỗi tự động chứ không chỉ ghi nhắc; mỗi loại dữ liệu chỉ có MỘT nơi được ghi; việc mới thì thêm file/thành phần riêng thay vì sửa chen vào file dùng chung; ngoại lệ phải hẹp, ghi rõ lý do và được duyệt như thay đổi kiến trúc.

Nguồn gốc (Lauren Tan, SpaceXAI): agent thích đi đường tắt nên làm cho đường tắt chính là đường đúng. Sửa thói xấu ở tầng chắc nhất có thể: cấu trúc code > lint/CI > quy tắc > skill > văn phong. Cấm comment kiểu bào chữa. Mỗi mẫu một đường đúng. Kiểm chứng bằng lệnh cố định + bản đồ tính năng.

### 2.2 Tư duy — [Nguyên văn chủ dự án]

> Nguyên tắc tư duy: mục đích project và các quyết định trong CLAUDE.md giữ NGUYÊN VĂN lời của tôi — bạn được đề xuất và làm dày, nhưng không tự viết lại ý và không tự chốt các quyết định mang tính tư duy (viết ra chính là lúc tư duy, phần đó là của tôi).

### 2.3 Tra bản đồ trước — [Nguyên văn chủ dự án]

> mọi việc làm/tái hiện lỗi/kiểm chứng đều phải tra FEATURE_MAP.md trước, cấm đoán đường.

### 2.4 Khoá cứng và khoá mềm — [Nguyên văn chủ dự án]

> Tôi đề xuất là cứ lỗi nào lặp đi lặp lại ít nhất 3 lần thì đưa thành quy tắc cứng - hard guardrail.

> khóa cứng là hard guardrail, tôi không rõ làm bằng gì nhưng là câu lệnh rõ ràng, không phải chỉ 1 file markdown. Còn khóa mềm đơn thuần là file markdown, tđôi lúc AI còn không thèm quét qua nên hay làm sai

## 3. Lệnh

| Việc | Lệnh |
|---|---|
| Cài lần đầu | `npm ci` (cache npm nằm `.cache/npm` trên ổ D; script cài đặt bị tắt trong `package.json` → `allowScripts`) |
| Chạy app (dev) | `npm run dev` → giao diện `http://127.0.0.1:5190`, API `http://localhost:8787` |
| Kiểm tra (hook commit + CI chạy đúng lệnh này) | `npm run verify` = kiểm registry node + lint + typecheck + test |
| Kiểm tra đầy đủ (trước khi mở PR) | `npm run verify:full` = verify + e2e (Playwright bấm thật trên giao diện, dịch vụ giả) |
| Thêm loại node | `npm run new:node <ten-node>` (sinh thư mục + cập nhật registry) |
| Sinh lại registry node | `npm run gen:nodes` (cấm sửa tay `src/nodes/registry.*.ts`) |
| Đổi cấu trúc db | sửa `src/core/db/schema.ts` → `npm run db:generate` (cấm viết SQL tay) |
| Đăng nhập tài khoản Muse | `npm run muse:login -- muse_vid_01` (mở Chrome của hồ sơ đó, đăng nhập tay, đóng cửa sổ) |
| Thử Muse thật 1 clip | `npm run smoke:muse` (tốn 1 lượt Muse) |

Công cụ ngoài: Node ≥ 24, ffmpeg/ffprobe trong PATH, Google Chrome đã cài.

## 4. Kiến trúc hiện tại

Chi tiết: `docs/ARCHITECTURE.md`. Tóm tắt nơi ghi từng loại dữ liệu:

| Dữ liệu | Ở đâu | Nơi ghi đúng duy nhất |
|---|---|---|
| Workflow, run, trạng thái node, cache node | `.data/app.db` (SQLite) | `src/core/db/` qua các hàm trong `src/core/queue.ts`, `src/core/executor.ts`, `src/features/*/routes.ts` |
| File media (clip, ảnh) | `.data/media/YYYY-MM/<id>.<ext>` + bảng `media` | `src/core/storage.ts` (`importFile`) |
| Cấu hình | biến môi trường | đọc duy nhất ở `src/core/config.ts` |
| Phiên đăng nhập Muse | `.data/chrome_profiles/muse_vid_0N/` | Chrome (agent không đọc, không sửa) |
| Danh sách loại node | `src/nodes/registry.{server,web}.ts` | `npm run gen:nodes` |

## 5. Đường cấm — [Đề xuất của agent — chưa duyệt]

| # | Mẫu cấm | Làm thay | Vì sao |
|---|---|---|---|
| 1 | Đọc `process.env` ngoài `src/core/config.ts` | thêm vào `loadConfig()` | biến rải rác thì không biết app cần gì |
| 2 | Chạy chương trình ngoài (`child_process`) ngoài `src/core/ffmpeg.ts` | thêm hàm vào `ffmpeg.ts` | một chỗ kiểm lỗi, timeout, đường dẫn |
| 3 | Mở SQLite ngoài `src/core/db/client.ts` | dùng `openDb()` | một chỗ chạy migration |
| 4 | Điều khiển trình duyệt ngoài `src/providers/muse/` | thêm vào Muse provider | đụng tài khoản thật |
| 5 | Giao diện import code máy chủ hoặc gọi `fetch` ngoài `src/app/api-client.ts` | gọi qua `api-client.ts` | giữ ranh giới giao diện ↔ máy chủ |
| 6 | Máy chủ import React / code giao diện | tách phần dùng chung vào `src/shared/` hoặc `definition.ts` | — |
| 7 | Comment bào chữa (`TODO`, `FIXME`, `HACK`, `tạm thời`), `eslint-disable`, `@ts-ignore` | sửa luôn, hoặc ghi một dòng vào `DEBT.md` | agent dùng comment để hợp thức hoá chỗ ẩu |
| 8 | `catch` rỗng / nuốt lỗi thành "không có" | để lỗi nổi lên hoặc báo lỗi tiếng Việt rõ | lỗi thành "thành công giả" |
| 9 | "Thành công giả": báo xong khi chưa có file thật, bịa thời lượng | báo lỗi rõ | người dùng tưởng đã xong |
| 10 | Test gọi Muse thật | dùng dịch vụ `fake`; test thật cần `MUSE_LIVE=1` | tốn lượt, đụng tài khoản |
| 11 | Sửa tay `src/nodes/registry.*.ts` | `npm run gen:nodes` | registry lệch thư mục |
| 12 | Ghi file media không qua `storage.importFile` | `storage.importFile` | mất dấu sha256 → nhận nhầm video cũ của Muse |
| 13 | Ghi, xoá file ngoài `D:\29. Workflow VideoPic` | — | chủ dự án cấm (mục 6) |
| 14 | Commit thẳng lên `main`, force-push | nhánh + PR | khoá nhánh trên GitHub |
| 15 | File dùng chung (`src/shared/**`, `src/nodes/*/definition.ts`) import code máy chủ hoặc giao diện | chỉ dùng zod và các file shared khác | các file này chạy ở cả hai phía; kéo thêm là vỡ ranh giới |
| 16 | Thêm node bằng tay thiếu file (không test, không view) | `npm run new:node <ten>` | node thiếu test lọt vào |
| 17 | Thêm endpoint mà không ghi vào `FEATURE_MAP.md` | ghi dòng mới ở bảng luồng tương ứng | bản đồ lệch code → agent đoán đường |

### 5.1 Khoá cứng hay khoá mềm (theo mục 2.4)

- **Khoá cứng**: có lệnh tự chạy (lint, test kiến trúc, hook git, CI, khoá nhánh GitHub), vi phạm là bị chặn.
- **Khoá mềm**: chỉ ghi ở đây, dựa vào agent đọc.

| # | Khoá | Máy kiểm | Số lần vi phạm đã ghi nhận |
|---|---|---|---|
| 1 | cứng | ESLint `no-restricted-properties` (`eslint.config.js`) | 0 |
| 2 | cứng | ESLint `no-restricted-imports` | 0 |
| 3 | cứng | ESLint `no-restricted-imports` | 0 |
| 4 | cứng | ESLint `no-restricted-imports` | 0 |
| 5 | cứng | ESLint `no-restricted-imports`, `no-restricted-globals` | 0 |
| 6 | cứng | ESLint `no-restricted-imports` | 0 |
| 7 | cứng | ESLint `no-warning-comments`, `noInlineConfig`, `@typescript-eslint/ban-ts-comment` | 0 |
| 8 | cứng một phần | ESLint `no-empty`; còn mềm: `catch` có thân nhưng vẫn nuốt lỗi | 0 |
| 9 | mềm | — | 0 |
| 10 | cứng | `src/providers/muse/index.ts` từ chối chạy khi `APP_ENV=test` mà thiếu `MUSE_LIVE=1`; test `src/providers/muse/muse.test.ts` | 0 |
| 11 | cứng | `npm run gen:nodes -- --check` trong `verify` | 0 |
| 12 | mềm | — | 0 |
| 13 | mềm | quyền trong `.claude/settings.json` chặn một phần | 0 |
| 14 | cứng | `.githooks/pre-commit` + khoá nhánh GitHub (`main`: bắt PR, bắt check `verify` và `e2e`, cấm force-push, áp cả admin) | 0 |
| 15 | cứng | ESLint `no-restricted-imports` (khối `src/shared/**`) | 0 |
| 16 | cứng | `scripts/gen-nodes.ts` (từ chối thư mục node thiếu file) + `tests/architecture.test.ts` | 0 |
| 17 | cứng | `tests/architecture.test.ts` (endpoint và `data-testid` phải có trong `FEATURE_MAP.md`) | 0 |

Ghi nhận khoá cứng đã bắt lỗi thật: 27/10/2026, `src/server.ts` đọc `process.env` (dòng 1); `src/app/_lock_probe.ts` thử cố ý 5 vi phạm (1, 2, 5, 7, 8) đều bị chặn.

## 6. Quy tắc làm việc của agent

**[Nguyên văn chủ dự án]** (27/10/2026, duyệt quyền một lần)

> A. Duyệt. Miễn là không sửa file, xóa folder khác ngoài thư mục của dự án là được. Cấm xóa file ổ C và các thư mục khác ngoài thư mục dự án là D:\29. Workflow VideoPic
> B. 1 duyệt, 2 thì clone cách làm là được, tôi sẽ login tài khoản khác, đỡ phải dùng chung. 3 Cứ gọi cho đến khi xong thì thôi, còn nếu bị rơi vào loop thì mới dừng báo tôi chứ. 4 được phép đọc. 5 duyệt.
> C. duyệt

Giải nghĩa các mục A/B/C (agent ghi lại đề xuất đã được duyệt ở trên):
- A: tự tạo file, cài thư viện, commit, chạy test, mở app và bấm thử như người thật, sửa lỗi, tạo nhánh + PR, CI xanh thì tự gộp — **chỉ trong `D:\29. Workflow VideoPic`**.
- B1: repo công khai `Nagias/videopic-workflow`, khoá nhánh `main`. B2: hồ sơ Chrome riêng của dự án, chủ dự án tự đăng nhập tài khoản khác Story Studio. B3: gọi Muse thật đến khi xong; gặp vòng lặp lỗi thì dừng và báo. B4: được đọc (không sửa) Story Studio. B5: `.claude/settings.json` 3 vòng.
- C: không bao giờ sửa Story Studio, in cookie/mật khẩu, xoá dữ liệu ngoài dự án, push thẳng `main`.

**Làm dày — [Đề xuất của agent — chưa duyệt]**
- Mỗi việc một nhánh từ `main`, tên tiếng Việt không dấu. Commit tiếng Việt dạng `<vùng>: <mô tả>`, mỗi thay đổi một commit.
- Trước khi sửa: tra `FEATURE_MAP.md`; việc dài ghi checklist `TASKS.md`.
- Bằng chứng tối thiểu trước khi báo "xong": `npm run verify:full` xanh; đổi giao diện thì mở app và bấm đúng phần tử ghi trong `FEATURE_MAP.md`; đổi video thì mở file thật (ffprobe + xem). Chưa có bằng chứng thì báo "chưa kiểm chứng".
- Quota Muse: ghi số lần gọi thật vào `TASKS.md`. Cùng một lỗi lặp 3 lần liên tiếp thì dừng, báo chủ dự án.
- Làm tắt bất cứ chỗ nào: ghi vào `DEBT.md` (nợ gì, vì sao chấp nhận, khi nào trả). Test kiến trúc kiểm định dạng sổ.

## 7. Sổ vận hành

| Tình huống | Dấu hiệu | Cách xử lý |
|---|---|---|
| Hồ sơ Muse hết phiên đăng nhập | node báo "Tài khoản muse_vid_0N cần đăng nhập lại" | `npm run muse:login -- muse_vid_0N`, đăng nhập, đóng cửa sổ |
| Muse đổi giao diện | node báo "Không tìm thấy ô nhập chat của Muse" | sửa selector trong `src/providers/muse/dom.ts`, chạy `npm run smoke:muse` |
| Chrome báo hồ sơ đang mở | lỗi khi khởi động hồ sơ | đóng cửa sổ Chrome đang dùng hồ sơ đó (cửa sổ đăng nhập tay) rồi chạy lại |
| Thiếu ffmpeg | lỗi "Không chạy được ffmpeg" | cài ffmpeg và thêm vào PATH |
| Run bị dừng giữa chừng (tắt máy) | run ở trạng thái `running` | mở lại `npm run dev`: worker tự chạy tiếp, node đã xong không gọi lại Muse |
| Muse lỗi không rõ lý do | thông báo lỗi trên node có `[ảnh lỗi: …png]` | mở ảnh + file `.html` cùng tên trong `.data/debug/` để xem Muse đang hiện gì, rồi sửa `dom.ts`; thử lại bằng `npx playwright test e2e/muse-driver.spec.ts` (trang giả, không tốn lượt) trước khi gọi Muse thật |
| Mở `localhost:5173` ra app khác | dự án khác trên máy chiếm cổng 5173 qua IPv6 | dự án này dùng `http://127.0.0.1:5190`; đổi bằng biến `WEB_PORT` |
| Muốn xem Chrome điều khiển Muse | — | chạy với `MUSE_HEADLESS=0` |
