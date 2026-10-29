# Sổ nợ có chủ đích

Mọi chỗ làm tắt ở giai đoạn đầu ghi vào đây. Không ghi comment `TODO`/`tạm thời` trong code (bị lint chặn) — ghi ở đây.
Test `tests/architecture.test.ts` kiểm bảng: đủ 6 cột, mã `N-xxx` không trùng, cột "Trả khi" không để trống.
Trả nợ xong: chuyển dòng xuống mục "Đã trả", ghi ngày và commit.

## Đang nợ

| Mã | Nợ gì | Vì sao chấp nhận | Rủi ro nếu không trả | Trả khi | Ngày ghi |
|---|---|---|---|---|---|
| N-001 | Giao diện hỏi trạng thái run bằng cách gọi lại API mỗi giây (polling), chưa dùng WebSocket | Một người dùng, một máy; polling đơn giản, ít chỗ hỏng | Chạy hàng trăm node cùng lúc thì nhiều request thừa | Khi một workflow có > 50 node chạy song song, hoặc làm tiến độ % theo thời gian thực | 27/10/2026 |
| N-003 | Workflow chỉ có một bản mặc định (`GET /api/workflows/default`), chưa có danh sách / tạo mới / đổi tên | Bộ khung chỉ cần chứng minh luồng xuyên suốt | Muốn giữ nhiều dự án video phải chép tay | Khi bắt đầu làm video thật thứ hai | 27/10/2026 |
| N-004 | Muse provider chưa đính kèm ảnh (chỉ text-to-video) | Đính kèm ảnh thuộc tính năng 2 (giữ nhân vật, nối khung) | Chưa giữ được mặt/sản phẩm | Tính năng 2 | 27/10/2026 |
| N-006 | Selector Muse (`src/providers/muse/dom.ts`) chỉ được kiểm trên trang Muse giả; chưa có lệnh tự kiểm selector trên muse.ai thật mà không gửi prompt | Viết lệnh soi trang cần thêm thời gian; đã có ảnh lỗi `.data/debug/` để sửa nhanh | Muse đổi giao diện → mất 1 lượt mỗi lần thử trước khi biết (đã mất 2 lượt ngày 27/10) | Trước khi chạy chuỗi clip dài (tính năng 2): thêm `npm run muse:check` soi selector không gửi prompt | 27/10/2026 |
| N-007 | Nhận biết "hồ sơ đã đăng nhập" bằng sự có mặt thư mục IndexedDB của muse.ai (cách Story Studio) | Đơn giản, đủ dùng; lỗi đăng nhập thật vẫn bị bắt ở bước tìm ô chat (`SESSION_EXPIRED`) | Báo sai "đã đăng nhập" khi phiên hết hạn; chỉ biết khi chạy | Khi có lệnh `muse:check` (N-006) thì kiểm thật | 27/10/2026 |
| N-008 | Gói giao diện > 500 KB (React + React Flow + zod), chưa chia nhỏ | App chạy trên máy, tải một lần qua localhost | Không đáng kể | Khi mở app qua mạng chậm hoặc thêm nhiều thư viện giao diện | 27/10/2026 |
| N-009 | Quyền `.claude/settings.json` cho chạy `npm run`, `ffmpeg`, `npx playwright` không hỏi = cho agent chạy code tuỳ ý trong dự án | Chủ dự án duyệt cho agent tự chạy, tự test (27/10/2026) | Agent có thể chạy lệnh ngoài ý muốn qua script; chặn chính vẫn là khoá nhánh GitHub + cấm sửa ngoài dự án | Khi có người khác dùng chung repo | 27/10/2026 |
| N-010 | Giữ mặt nhân vật dựa vào **đính kèm ảnh hồ sơ** cho mỗi ảnh khung — Muse từ chối 1 lần với ảnh chân thực có người (27/10/2026, chưa chắc là chính sách) | Thiết kế làm trước khi biết chính sách Muse; thay đổi cần chạy Muse thật để kiểm, mà video Muse đang lỗi | Node Hồ sơ nhân vật dừng ở ảnh thứ 2; ảnh khung có nhân vật bị từ chối | Ngay bước tiếp theo: chuyển sang "một đoạn chat Muse cho cả nhân vật" (ảnh chân dung → ảnh khung từng cảnh nối tiếp trong cùng chat, không tải ảnh người lên) — đã thử thật giữ mặt tốt | 27/10/2026 |
| N-011 | Muse báo lỗi/thất bại thường chỉ hiện ở ô nhiệm vụ bên phải; app mới bắt qua câu trả lời trong chat (`MUSE_FAILURE_RE`) | Đủ cho các câu đã gặp | Câu báo lỗi kiểu mới → chờ hết 10 phút mới biết | Khi gặp câu báo lỗi chưa có trong `MUSE_FAILURE_RE` (thêm vào), hoặc làm `muse:check` (N-006) đọc ô nhiệm vụ | 27/10/2026 |
| N-012 | Muse: câu trả lời chữ coi là "xong" khi đứng yên 3 lần quét (~9 giây), chưa đọc dấu hiệu "đang gõ" của giao diện | Chưa đo DOM "đang gõ" của muse.ai; trang giả kiểm được cách chờ | Muse ngừng gõ > 9 giây giữa chừng → Biên kịch nhận JSON dở → bị luật bắt và nhờ sửa (tốn 1 lượt chữ) | Khi gặp lần đầu trong nhật ký TASKS.md: soi DOM "đang gõ" và thêm vào `dom.ts` | 28/10/2026 |
| N-013 | Kho tài sản chưa có nút xoá/đổi tên mục; trùng tên thì hiện hai mục | Ít mục, một người dùng | Kho dài, khó chọn | Khi kho > 30 mục | 28/10/2026 |
| N-014 | Biên kịch không có ô sửa tay riêng (muốn sửa phải chép sang node Danh sách cảnh) | Giữ một nơi sửa cảnh duy nhất | Sửa 1 cảnh của Biên kịch phải chép cả danh sách | Khi chủ dự án dùng Biên kịch thường xuyên: thêm nút "Chép sang Danh sách cảnh" | 28/10/2026 |
| N-015 | Khi danh sách đồ vật đến từ Biên kịch, tên/trạng thái đồ vật lạ chỉ bị chặn trong từng Cảnh (trước khi Cảnh đó gọi Muse, `src/nodes/scene/run.ts`), không chặn cả lượt chạy ở bước kiểm luật trước khi chạy (`scenesFeeding()` chưa biết món nào trước khi Đồ vật chạy) | Các cảnh khác chạy song song không mất lượt vì kết quả được cache và dùng lại | Một lượt chạy kết thúc với cảnh lỗi trong khi cảnh khác đã chạy | Khi chủ dự án muốn chặn cả lượt chạy, hoặc khi Biên kịch → thẻ cảnh (Task 5) cho thấy lỗi này hay gặp | 29/10/2026 |
| N-016 | Giao diện tải lại đồ thị ngay khi Biên kịch xong trong lúc chạy (`writersFinished()` + `reloadGraph()` ở `Editor.tsx`), nhưng máy chủ không kiểm phiên bản khi `PUT /api/workflows/:id`: sửa đồ thị trong khoảng từ lúc Biên kịch xong đến lúc tải lại (≤ 1 lần hỏi tiến độ + một GET) vẫn gửi nhóm thẻ cảnh cũ đè nhóm máy chủ vừa tạo lại | Khoảng hở chỉ ~1–2 giây; lần Chạy sau Biên kịch dùng cache, khác `resultKey` nên nhóm tự tạo lại (không tốn lượt chữ), sửa tay thì hộp Thay/Giữ hỏi | Thẻ cảnh trên canvas về bộ cũ sau một lần chạy, phải bấm Chạy lại | Đợt giao diện 1B (thẻ cảnh), hoặc khi gặp thật: `PUT` kèm `updatedAt` đã đọc, máy chủ trả 409 khi lệch | 29/10/2026 |

## Đã trả

| Mã | Nợ gì | Ngày trả | Commit |
|---|---|---|---|
| N-005 | Không có nút huỷ run đang chạy — trả bằng `POST /api/runs/:id/cancel` (`queue.cancel()`: huỷ tín hiệu riêng của run, không gửi việc mới cho dịch vụ); nút trên giao diện làm ở Task 8 | 29/10/2026 | `f46a0b7` |
| N-002 | Node trong một run chạy tuần tự — trả bằng executor lập lịch theo dây nối: node đủ nguồn thì chạy ngay, giới hạn đồng thời theo từng dịch vụ ở `ctx.shared.slot`. Worker vẫn chạy từng run một | 29/10/2026 | `e2f5d06` |
