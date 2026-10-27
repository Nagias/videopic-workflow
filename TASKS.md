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

## Tính năng 2 — video chuỗi cảnh (kế hoạch: `docs/superpowers/plans/2026-10-27-video-chuoi-canh.md`)

- [x] Task A–D: dịch vụ ảnh/ảnh→video, Muse đính kèm/bắt từ chối, kiến thức đạo diễn, 4 node, mẫu Sơn La, giao diện, test (62 vitest + 8 e2e, chạy giả trọn 12 cảnh ra 59,8 giây)
- [ ] Task E: chạy Muse thật mẫu Sơn La — **bị chặn** (xem nhật ký 27/10 ~22:50–23:40)

### Nhật ký gọi Muse thật — tính năng 2 (27/10/2026)

| Giờ | Hồ sơ | Việc | Kết quả |
|---|---|---|---|
| 22:52 | vid_01 | Ảnh chân dung chính diện (chỉ chữ) | ✅ ~120 giây, đúng yêu cầu (người Việt phổ thông, mộc mạc, sports bra) |
| 22:53 | vid_03 | Ảnh nghiêng 3/4 **đính kèm** ảnh chân dung | ❌ Muse từ chối: "chưa tạo được… không dựa trên ảnh tham chiếu, hoặc phiên bản minh hoạ" (1 lần, chưa chắc là chính sách) |
| 22:57 | vid_01 | Video từ ảnh chân dung tải lên | ❌ Muse nhận việc rồi "video failed" sau ~8 phút |
| 23:05 | vid_01 | Ảnh mới **trong cùng đoạn chat**, không tải lên ("chính cô gái bạn đã tạo trước đó") | ✅ 109 giây — giữ đúng mặt, tóc, trang phục; có lều xanh rêu, suối đá |
| 23:06 | vid_01 | Video từ chính ảnh đó trong chat (không tải lên) | ❌ "dịch vụ tạo video đang tạm lỗi" sau ~7 phút |
| 23:15 | vid_04 | Ảnh trong chat + video từ ảnh đó | Ảnh ✅ 61 giây; video ❌ "lỗi hệ thống bất ngờ" |
| 23:26 | vid_03 | Video thuần chữ (cô gái bổ củi) | ❌ "Failed to create 5s video of woman splitting log" (ô nhiệm vụ Muse) |
| 23:26 | vid_04 | Ảnh suối không người + video từ ảnh đó | Ảnh ✅ 38 giây; video ❌ "lỗi hệ thống bất ngờ" |

| 28/10 00:17 | vid_01 → vid_03 | Smoke 1 clip chữ→video trong chat phụ | ❌ vid_01: không mở được chat phụ (nút "+" chưa được tìm sau khi mở menu — đã sửa); tự thử lại chat phụ mới trên vid_03: Muse "hệ thống tạo video gặp lỗi bất ngờ… hẹn thử lại 01:36". Muse tự trả lời chủ dự án: máy chủ video lỗi 502 |
| 28/10 ~00:35 | vid_01, vid_03, vid_04 | Qua giao diện: Hồ sơ nhân vật (3 ảnh nối tiếp trong 1 chat phụ) + Hồ sơ không gian (2 ảnh) | ✅ 3 ảnh nhân vật cùng một người, cùng trang phục (góc 3/4 ra toàn thân → đã sửa prompt thành chân dung cận). Không gian: toàn cảnh ✅; cận khu lều lần 1 bị app loại oan (dấu vân tay ảnh coi là trùng ảnh đính kèm) → tự thử lại chat phụ mới ✅. Đã bỏ kiểm dấu vân tay, thay bằng đánh dấu ảnh trong bong bóng tin nhắn của mình 2 giây sau khi gửi |

Kết luận: (1) Muse từ chối 1 lần ảnh chân thực có đính kèm ảnh người — **chưa chắc là chính sách** (chủ dự án chỉ gặp báo lỗi máy chủ video), cần thử lại; (2) tạo ảnh nối tiếp trong cùng đoạn chat giữ mặt rất tốt; (3) tạo video của Muse thất bại trên cả 3 tài khoản tối 27/10 (cả có người lẫn không người, cả từ chữ lẫn từ ảnh) — lúc 21:55 cùng ngày video từ chữ vẫn thành công → nghi lỗi/giới hạn phía Muse, cần thử lại. Tổng lượt Muse tính năng 2: ~12 (5 ảnh thành công).
