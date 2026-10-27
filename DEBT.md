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

## Đã trả

| Mã | Nợ gì | Ngày trả | Commit |
|---|---|---|---|
