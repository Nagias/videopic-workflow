# TASKS

## Bộ khung đi được (kế hoạch: `docs/superpowers/plans/2026-10-27-khung-di-duoc.md`)

- [x] Task 1: Nền dự án, tài liệu agent, CI, khoá nhánh
- [x] Task 2: Lõi máy chủ — config, db, storage, ffmpeg
- [x] Task 3: Đồ thị, node, executor có cache
- [x] Task 4: Provider fake + Muse
- [x] Task 5: Hàng đợi + API
- [x] Task 6: Giao diện canvas
- [x] Task 7: Khoá cứng + e2e + công cụ
- [x] Task 8: Chạy thật + FEATURE_MAP + sổ nợ

## Nhật ký gọi Muse thật

| Ngày giờ | Hồ sơ | Việc | Kết quả | Thời gian |
|---|---|---|---|---|
| 27/10/2026 ~21:35 | muse_vid_01 | Luồng 1 qua giao diện, clip 5s rừng nguyên sinh | **Lỗi phía app**, prompt đã gửi nên mất 1 lượt: quét video trả rỗng (`page.evaluate` chuỗi bỏ qua tham số). Đã sửa (`callJs()`), thêm test trang Muse giả `e2e/muse-driver.spec.ts` | ~20 giây |
| 27/10/2026 ~21:40 | muse_vid_01 | Như trên, lần 2 | **Lỗi phía app**, mất 1 lượt: bấm nhầm nút "Allow" ngoài khung chat, treo 30 giây. Soi trang (không tốn lượt): Muse đã tạo xong cả 2 clip trong chat chính; nút "New side chat" nay nằm trong menu Chats. Đã sửa selector, thêm chụp ảnh lỗi `.data/debug/` | ~60 giây |
| 27/10/2026 ~21:55 | muse_vid_01 | Như trên, lần 3, bấm qua giao diện | **Thành công**: clip h264 1280×720 24 fps có tiếng, 5,0 giây, nội dung đúng prompt (khung giữa clip đã xem). Mở đoạn chat phụ mới qua menu Chats. Chạy lại = "Dùng lại kết quả", không gọi Muse | 104 giây |

Tổng lượt Muse đã dùng cho bộ khung: 3 (2 lỗi phía app đã sửa, 1 thành công).
