# Tính năng 2 — Video ~1–2 phút từ chuỗi clip Muse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mẫu workflow "Sinh tồn Sơn La": Hồ sơ nhân vật + Hồ sơ không gian + Danh sách 12 cảnh → node Dựng phim chạy thẳng (ảnh khung → clip 5 giây → bù sáng → ghép) ra video ~60 giây giữ đúng mặt, trang phục, lều/suối.

**Architecture:** Mở rộng `VideoProvider` thêm `generateImage` và `firstFrame` cho video. Kiến thức đạo diễn là dữ liệu trong `src/shared/director.ts` (cỡ cảnh, góc máy, chuyển động → câu prompt). Node Dựng phim chạy các cảnh như một đồ thị nhỏ có phụ thuộc (cảnh "nối" chờ clip trước), song song theo số hồ sơ Muse rảnh, mỗi bước con có cache riêng (`ctx.step()`), nên sửa một cảnh chỉ chạy lại cảnh đó.

**Spec:** chat 27/10/2026 (chủ dự án: chạy thẳng không dừng duyệt; gương mặt AI giống người thật, nét phổ thông Việt Nam, mộc mạc; Claude điều phối phần còn lại) + `docs/ARCHITECTURE.md` mục 6.

## Global Constraints
- Clip 5 giây; 12 cảnh ≈ 60 giây; 16:9; giữ tiếng gốc Muse.
- Nhân vật luôn ghi "adult woman, early 20s". Trang phục viết "sports bra" (đồ tập), không viết "chỉ mặc áo ngực" (bộ lọc Muse).
- Mỗi lần gọi Muse ảnh đều đính kèm hồ sơ gốc (nhân vật và/hoặc không gian); video ảnh→video chỉ đính kèm ảnh khung.
- Nối khung cuối → khung đầu tối đa 2 cảnh liền; còn lại cắt cảnh.
- Muse từ chối (chữ từ chối trong chat, không có media) → lỗi `REFUSED` kèm câu Muse trả, không coi là thành công.

## Review Focus
1. Muse trả lại chính ảnh đính kèm như "kết quả" → phải loại (trùng sha256 với ảnh đã có trong `media`). Test trang Muse giả.
2. Một cảnh lỗi giữa chừng → các cảnh đã xong vẫn được cache; chạy lại chỉ làm cảnh lỗi và cảnh phụ thuộc nó. Test executor/film.
3. Cảnh "nối" mà cảnh trước bị lỗi → cảnh nối không chạy, báo rõ. Test film.
4. Clip Muse dài 10 giây dù xin 5 giây → cắt về đúng 5 giây khi ghép. Test ffmpeg concat.
5. Chỉ 1 tài khoản rảnh → vẫn chạy hết, tuần tự. Test pool `acquireWait`.

### Task A: Dịch vụ — ảnh, ảnh→video, ffmpeg
`src/providers/types.ts` (+`generateImage`, `firstFrameMediaId`), `src/providers/fake` (ảnh màu, video từ ảnh), `src/core/ffmpeg.ts` (+`extractFrame`, `normalizeImage`, `measureLuma`, `stabilizeBrightness`, `concatClips`), test.
### Task B: Muse — tạo ảnh, đính kèm nhiều file, bắt từ chối, chờ tài khoản rảnh
`src/providers/muse/*`, `e2e/muse-driver.spec.ts` (thêm ảnh + đính kèm + từ chối).
### Task C: Kiến thức đạo diễn + node
`src/shared/director.ts`, cổng `imageset`/`shotlist`/`storyboard`, `ctx.step()` + báo kết quả từng phần, node `character`, `location`, `shotlist`, `film`, test.
### Task D: Mẫu workflow + API + giao diện
`GET /api/workflows`, `POST /api/workflows/from-template/:templateId`, chọn workflow trên thanh công cụ, view 4 node, e2e luồng 2 (dịch vụ giả, 3 cảnh).
### Task E: Chạy Muse thật mẫu "Sinh tồn Sơn La" trong preview, FEATURE_MAP luồng 2, DEBT, PR.
