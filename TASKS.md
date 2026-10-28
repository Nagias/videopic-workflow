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
- [x] Task E: chạy Muse thật mẫu Sơn La — xong 28/10 07:03, phim 59,8 giây 1280x720 (`.data/exports/Sinh-ton-Son-La-60s.mp4`)

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

| 28/10 01:05–01:45 | vid_01/03/04 | Chạy cả mẫu Sơn La qua giao diện (lần 1) | Hồ sơ dùng lại cache. Ảnh khung: đều ✅ trừ cảnh 4 (Muse từ chối 2 lần mô tả "lưỡi rìu bổ khúc gỗ" cận cảnh). Video: cảnh 2, 3 ✅ (đẹp, đúng người); cảnh 1, 5, 8 ❌ Muse "quá tải/lỗi 502"; cảnh 9 ❌ lỗi app (tải blob "Failed to fetch" → đã sửa). Dừng tay theo quy tắc lặp lỗi 3 lần |
| 28/10 01:50– | vid_01/03/04 | Chạy lại sau khi thêm cầu dao, sửa cảnh 4 (không rìu, cảnh phụ) | Cache: cảnh 2, 3 và ảnh khung cũ không tốn lượt. Ảnh khung cảnh 4 mới ✅. Video cảnh 1, 4, 5 lần 1 ❌ Muse 502 (Muse tự thử 3 lần bên trong, mỗi lần hỏng ~5–10 phút) |
| 28/10 06:56–07:03 | vid_01/03/04 | Chạy tiếp lần 3 khi Muse hết lỗi 502 | ✅ 10 cảnh còn lại xong trong 7 phút (mỗi clip 55–76 giây), không lỗi, không thử lại. Cache giữ cảnh 2, 3 và ảnh khung cũ. Gọi thật: 10 video + 1 ảnh khung (cảnh 12; cảnh nối 6, 10 lấy khung cuối clip trước, không gọi Muse). Đã xem đầu/giữa/cuối từng clip: đúng kịch bản, cùng một người, chỗ nối 5→6 và 9→10 khớp tư thế |

### Nhật ký gọi Muse thật — thử nghiệm prompt cảnh bổ củi (28/10/2026, nhánh `thu-nghiem-prompt-muse`, script `scripts/spike-bo-cui.ts`)

Prompt gửi nguyên văn (không bọc khuôn `formatVideoPrompt`), kết quả ở `.data/exports/thu-nghiem-bo-cui/` (`ket-qua.json` có đủ prompt). 6 lượt, cả 6 ✅.

| Cách | Hồ sơ | Kết quả |
|---|---|---|
| V1 chữ→video, chat mới, prompt ngắn kiểu vlog điện thoại | vid_03/04 | ✅ 144 giây. Trông thật nhất (màu tự nhiên, trời âm u), gỗ tách đúng lực. Mất nhân vật và lều (lều xanh dương, mặt khác) |
| V2 chữ→video **trong chat phụ của nhân vật** | vid_01 | ✅ 67 giây (1248x704). Giữ người, bổ gỗ đúng lực, nhưng bối cảnh kế thừa chất "bóng" của các ảnh cũ trong chat (núi đá vôi, rêu rực) |
| V3a ảnh khung cũ + prompt chỉ tả việc **sau** khung đầu | vid_03/04 | ✅ 81 giây. Rìu bổ trúng khúc gỗ, gỗ tách đôi đổ hai bên (lỗi cũ hết). Vẫn bóng như ảnh khung cũ; cuối clip tự chuyển sang cô gái cười vào máy |
| V3 ảnh khung mới (trong chat nhân vật, kiểu ảnh điện thoại, trời âm u, bối cảnh đơn giản) | vid_01 | ✅ 38 giây. Giữ mặt, bớt bóng rõ rệt, khúc gỗ dựng trên gốc cây đúng |
| V3 ảnh khung mới → video, prompt tả việc sau khung đầu | vid_01 | ✅ 73 giây. Bổ trúng, gỗ tách đúng; tự nhiên hơn V3a; cuối clip cũng cười vào máy |
| V4 cận B-roll chữ→video có bàn tay + lưỡi rìu | vid_03/04 | ✅ 84 giây. Có nguyên nhân (rìu) → gỗ tách hợp lý; tay là tay người lạ, không phải nhân vật |

Kết luận (mỗi cách mới thử 1 lần): (1) prompt video chỉ tả việc xảy ra sau khung đầu sửa được lỗi "gỗ biến mất/tự tách"; (2) chất nhựa đến từ ảnh khung và từ chat đã chứa ảnh bóng — ảnh khung kiểu ảnh điện thoại, trời âm u, bối cảnh đơn giản bớt nhựa rõ; (3) cảnh không người nên đi chữ→video thẳng; (4) Muse hay thêm đoạn cười vào máy ở cuối → prompt cần "không nhìn vào máy quay". Tổng lượt Muse thử nghiệm: 6.

Kết luận: (1) Muse từ chối 1 lần ảnh chân thực có đính kèm ảnh người — **chưa chắc là chính sách** (chủ dự án chỉ gặp báo lỗi máy chủ video), cần thử lại; (2) tạo ảnh nối tiếp trong cùng đoạn chat giữ mặt rất tốt; (3) tạo video của Muse thất bại trên cả 3 tài khoản tối 27/10 (cả có người lẫn không người, cả từ chữ lẫn từ ảnh) — lúc 21:55 cùng ngày video từ chữ vẫn thành công → nghi lỗi/giới hạn phía Muse, cần thử lại. Tổng lượt Muse tính năng 2: ~12 (5 ảnh thành công).

## Nâng chất lượng video (kế hoạch: `docs/superpowers/plans/2026-10-28-chat-luong-video.md`)

- [x] Task 1–8: cảnh v2 + luật đồ vật, prompt chống nhựa, ghép nén một lần, ảnh mẫu 4 góc + đồ vật, Dựng phim v2, kho tài sản, Muse đọc chữ, Biên kịch
- [x] Task 9: mẫu Sơn La v2 + Ý tưởng → phim, e2e, tài liệu
- [x] Soát toàn nhánh (subagent): 1 nghiêm trọng + 3 quan trọng đã sửa (mở workflow cũ, chọn từ kho, Biên kịch/Đồ vật, Đồ vật allSettled); 7 lỗi nhỏ ghi sổ
- [x] Task 10: Muse thật (Sơn La v2 ✅, Ý tưởng → phim ✅), PR

### Nhật ký gọi Muse thật — nâng chất lượng (28/10/2026, nhánh `nang-cap-chat-luong-video`)

| Giờ | Việc | Kết quả |
|---|---|---|
| 16:36–17:03 | Mẫu Sơn La v2 qua API máy chủ dev (workflow `sinh-ton-son-la-mvrx71w5`) | ✅ 24 ảnh (nhân vật 4, không gian 2, đồ vật 9, ảnh khung 9) + 12 video, không lỗi Muse. Phim 59,8 giây, 9,2 Mbps (`.data/exports/Sinh-ton-Son-La-v2-60s.mp4`). Máy chủ dev (tsx watch) tự khởi động lại 2 lần vì agent sửa code giữa lượt → một số việc Muse đang chạy bị bỏ dở (ước 2–4 lượt mất), lượt chạy tự làm tiếp từ cache |
| xem phim | Đã xem đầu/giữa/cuối 12 cảnh | Hết nhựa rõ: trời âm u, núi đất Tây Bắc (không còn núi đá vôi kiểu Quế Lâm), màu tự nhiên; lều xanh rêu dây cam và bếp đá giữ đúng hình mọi cảnh; cảnh 3 rìu bổ trúng khúc gỗ rồi gỗ tách đôi; cảnh 4 thấy tay rút rìu; cảnh 9 tia lửa → khói, cảnh 10 lửa bén, cảnh 12 toàn cảnh có lều + bếp cháy. Còn lỗi: cảnh 9–10 tay mọc tay áo dài; cảnh 8 lửa tự bén trước khi đánh lửa; cảnh 5–6 Muse thêm đống gỗ lớn, nền cảnh 6 trôi sang rừng rậm; cảnh 10 lửa ám màu cam đậm |
| 17:05 | Chỉnh prompt vòng 1 (commit `c7e8ce9`): cảnh tay ghi trang phục, video "chỉ làm đúng việc đã tả" | kiểm bằng lượt Biên kịch dưới |
| 17:07–17:25 | Mẫu Ý tưởng → phim (workflow `y-tuong-thanh-phim-mvrya2he`) | ✅ Biên kịch Muse viết đúng luật **ngay lần 1** (~2 phút, 1 lượt chữ): 8 cảnh, 5 đồ vật có chuỗi trạng thái (nồi rỗng → đầy nước → đang sôi; cốc rỗng → đầy → vơi). Nhân vật lấy lại từ kho/cache (0 lượt). 22 ảnh (không gian 2, đồ vật 12, ảnh khung 8) + 8 video, không lỗi. Phim 40 giây, 8,3 Mbps (`.data/exports/Y-tuong-thac-nuoc-40s.mp4`). Đã xem 8 cảnh: cảnh tay là tay trần đúng trang phục, cảnh xếp bếp chưa có lửa (hết làm quá việc), nồi/cốc giữ hình, rót nước có hơi bốc. Còn: vóc dáng nhân vật hơi đổi giữa cảnh |

| 17:34 | Bấm chạy lại Sơn La v2 sau khi chỉnh prompt | ⚠️ Lỗi app: node Dựng phim trả nguyên phim cũ từ cache vì khoá cache chỉ gồm tham số, không gồm prompt trong code. Đã sửa (commit `ca60895`): khoá node gồm `codeVersion()` của các hàm prompt. 0 lượt |
| 17:38–17:47 | Chạy lại Sơn La v2 (run `79d76e3e`) | ✅ 2 ảnh khung (cảnh tay 4, 9) + 12 video, không lỗi; nhân vật/không gian/đồ vật lấy lại cache (0 lượt). Phim 59,8 giây, 10 Mbps (`.data/exports/Sinh-ton-Son-La-v2b-60s.mp4`). Đã xem 12 cảnh: cảnh 4 và 9 tay trần đúng trang phục ✅, cảnh 8 chỉ xếp mồi chưa có lửa ✅. Còn: cảnh 10 (nối từ cảnh 9) vẫn mọc tay áo dài trong lúc chuyển động; cảnh 10–11 ánh lửa ám đỏ, da mặt loang; cảnh 5–6 vẫn có đống gỗ lớn (ảnh khung cũ dùng lại) |

| 18:35–20:26 | Thêm trang phục vào prompt chuyển động (commit `1fb98ba`), chạy lại Sơn La v2 (run `26bbf740`) | ✅ 10 video (các cảnh có người/tay; cảnh 1 và 7 không người dùng lại), ảnh khung dùng lại hết. Máy chủ dev tắt lúc ~18:40 khi đang 6/12 cảnh (không phải do sửa code; ước mất ~3 lượt đang chạy dở), mở lại 20:20 bằng `.claude/launch.json` (`port: 8787` vì công cụ xem trước gán biến PORT) → tự làm tiếp. Phim 59,8 giây, 10,4 Mbps (`.data/exports/Sinh-ton-Son-La-v2c-60s.mp4`). Đã xem 12 cảnh: cảnh 10 hết tay áo (tay trần) ✅, cảnh 4 và 9 vẫn đúng ✅, cảnh 8 chưa có lửa ✅, cảnh 10–11 lửa bớt ám đỏ. Còn: cảnh 5–6 vẫn có đống gỗ lớn (ảnh khung cảnh 5 dùng lại), nền cảnh 6 trôi sang rừng rậm |

Tổng lượt Muse thật đợt nâng chất lượng: thử nghiệm 6 + Sơn La v2 36 (+ ước 2–4 lượt mất do máy chủ khởi động lại) + Ý tưởng → phim 31 (1 chữ + 22 ảnh + 8 video) ≈ 75; chạy lại Sơn La thêm 14 → ≈ 89; lần chạy lại thứ hai 10 (+~3 mất) → ≈ 102.

