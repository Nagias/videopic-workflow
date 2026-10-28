# Sổ nợ có chủ đích

Mọi chỗ làm tắt ở giai đoạn đầu ghi vào đây. Không ghi comment `TODO`/`tạm thời` trong code (bị lint chặn) — ghi ở đây.
Test `tests/architecture.test.ts` kiểm bảng: đủ 6 cột, mã `N-xxx` không trùng, cột "Trả khi" không để trống.
Trả nợ xong: chuyển dòng xuống mục "Đã trả", ghi ngày và commit.

## Đang nợ

| Mã | Nợ gì | Vì sao chấp nhận | Rủi ro nếu không trả | Trả khi | Ngày ghi |
|---|---|---|---|---|---|
| N-001 | Giao diện hỏi trạng thái run bằng cách gọi lại API mỗi giây (polling), chưa dùng WebSocket | Một người dùng, một máy; polling đơn giản, ít chỗ hỏng | Chạy hàng trăm node cùng lúc thì nhiều request thừa | Khi một workflow có > 50 node chạy song song, hoặc làm tiến độ % theo thời gian thực | 27/10/2026 |
| N-002 | Worker chạy từng run một, trong cùng tiến trình máy chủ; node trong run chạy tuần tự | Bộ khung chỉ có 1 node tốn thời gian; chạy song song cần chia tài khoản Muse | Video 2 phút (12–24 clip) chạy chậm gấp N lần số tài khoản | Tính năng 2 (chuỗi clip): chạy song song theo số hồ sơ Muse rảnh | 27/10/2026 |
| N-003 | Workflow chỉ có một bản mặc định (`GET /api/workflows/default`), chưa có danh sách / tạo mới / đổi tên | Bộ khung chỉ cần chứng minh luồng xuyên suốt | Muốn giữ nhiều dự án video phải chép tay | Khi bắt đầu làm video thật thứ hai | 27/10/2026 |
| N-004 | Muse provider chưa đính kèm ảnh (chỉ text-to-video) | Đính kèm ảnh thuộc tính năng 2 (giữ nhân vật, nối khung) | Chưa giữ được mặt/sản phẩm | Tính năng 2 | 27/10/2026 |
| N-005 | Không có nút huỷ run đang chạy | Run bộ khung chỉ 1 clip (≤ 5 phút) | Run dài chạy sai không dừng được, tốn lượt Muse | Tính năng 2 | 27/10/2026 |
| N-006 | Selector Muse (`src/providers/muse/dom.ts`) chỉ được kiểm trên trang Muse giả; chưa có lệnh tự kiểm selector trên muse.ai thật mà không gửi prompt | Viết lệnh soi trang cần thêm thời gian; đã có ảnh lỗi `.data/debug/` để sửa nhanh | Muse đổi giao diện → mất 1 lượt mỗi lần thử trước khi biết (đã mất 2 lượt ngày 27/10) | Trước khi chạy chuỗi clip dài (tính năng 2): thêm `npm run muse:check` soi selector không gửi prompt | 27/10/2026 |
| N-007 | Nhận biết "hồ sơ đã đăng nhập" bằng sự có mặt thư mục IndexedDB của muse.ai (cách Story Studio) | Đơn giản, đủ dùng; lỗi đăng nhập thật vẫn bị bắt ở bước tìm ô chat (`SESSION_EXPIRED`) | Báo sai "đã đăng nhập" khi phiên hết hạn; chỉ biết khi chạy | Khi có lệnh `muse:check` (N-006) thì kiểm thật | 27/10/2026 |
| N-008 | Gói giao diện > 500 KB (React + React Flow + zod), chưa chia nhỏ | App chạy trên máy, tải một lần qua localhost | Không đáng kể | Khi mở app qua mạng chậm hoặc thêm nhiều thư viện giao diện | 27/10/2026 |
| N-009 | Quyền `.claude/settings.json` cho chạy `npm run`, `ffmpeg`, `npx playwright` không hỏi = cho agent chạy code tuỳ ý trong dự án | Chủ dự án duyệt cho agent tự chạy, tự test (27/10/2026) | Agent có thể chạy lệnh ngoài ý muốn qua script; chặn chính vẫn là khoá nhánh GitHub + cấm sửa ngoài dự án | Khi có người khác dùng chung repo | 27/10/2026 |
| N-010 | Giữ mặt nhân vật dựa vào **đính kèm ảnh hồ sơ** cho mỗi ảnh khung — Muse từ chối 1 lần với ảnh chân thực có người (27/10/2026, chưa chắc là chính sách) | Thiết kế làm trước khi biết chính sách Muse; thay đổi cần chạy Muse thật để kiểm, mà video Muse đang lỗi | Node Hồ sơ nhân vật dừng ở ảnh thứ 2; ảnh khung có nhân vật bị từ chối | Ngay bước tiếp theo: chuyển sang "một đoạn chat Muse cho cả nhân vật" (ảnh chân dung → ảnh khung từng cảnh nối tiếp trong cùng chat, không tải ảnh người lên) — đã thử thật giữ mặt tốt | 27/10/2026 |
| N-011 | Muse báo lỗi/thất bại thường chỉ hiện ở ô nhiệm vụ bên phải; app mới bắt qua câu trả lời trong chat (`MUSE_FAILURE_RE`) | Đủ cho các câu đã gặp | Câu báo lỗi kiểu mới → chờ hết 10 phút mới biết | Khi gặp câu báo lỗi chưa có trong `MUSE_FAILURE_RE` (thêm vào), hoặc làm `muse:check` (N-006) đọc ô nhiệm vụ | 27/10/2026 |

## Đã trả

| Mã | Nợ gì | Ngày trả | Commit |
|---|---|---|---|
