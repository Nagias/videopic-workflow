# Nâng chất lượng video: ảnh mẫu dùng chung, phân cảnh khung đầu/chuyển động, prompt chống "nhựa", biên kịch Muse — thiết kế

Ngày: 28/10/2026. Chủ dự án duyệt toàn bộ đề xuất trong chat cùng ngày ("Duyệt tất cả") và giao làm liền một mạch, tự test, báo kết quả cuối.

## 1. Vì sao làm

Phim "Sinh tồn Sơn La" (59,8 giây, Muse thật) giữ mặt và trang phục tốt nhưng:
- **Nhìn nhựa**: cả 12 cảnh đi đường "Muse vẽ ảnh tĩnh → Muse biến ảnh thành video"; ảnh tĩnh mang chất ảnh quảng cáo bóng (prompt "Photorealistic cinematic still", "cinematic smooth pacing"); app nén lại 2 lần (bù sáng rồi ghép, x264 veryfast) làm mất chi tiết da, lá.
- **Cảnh sạn**: prompt video kể lại việc đã xong trong ảnh khung ("đặt khúc gỗ… giơ rìu" khi ảnh đã có khúc gỗ dựng và rìu giơ) → khúc gỗ biến mất; cảnh cận "khúc gỗ tách đôi" bị ép "không có người" → gỗ tự tách không lực; đồ vật (gốc cây, khúc gỗ, bếp đá) không có ảnh mẫu nên mỗi cảnh một kiểu; mồi lửa đổi chỗ giữa các cảnh.

Thử thật 28/10 (6 lượt Muse, `TASKS.md`): prompt video chỉ tả việc **sau** khung đầu sửa được lỗi vật lý; ảnh khung kiểu "ảnh điện thoại, trời âm u, bối cảnh đơn giản" bớt nhựa rõ; chữ→video thẳng thật nhất cho cảnh không người; Muse hay thêm đoạn nhìn/cười vào máy ở cuối.

## 2. Mục tiêu / không làm / thất bại dù chạy được

Mục tiêu
1. Bộ ảnh mẫu (tài sản) cho nhân vật, bối cảnh, **đồ vật và trạng thái đồ vật**, tạo một lần, **dùng lại cho mọi video sau** (kho dùng chung giữa các workflow).
2. Mỗi cảnh viết theo khung đầu (ảnh đứng yên) + chuyển động 5 giây + đồ vật trong khung với trạng thái đầu/cuối; app tự chặn lỗi liên tục trạng thái và lỗi "hệ quả không có nguyên nhân".
3. Prompt Muse mới (tiếng Việt, giọng ảnh điện thoại/vlog, một câu "tông ảnh" chốt ở bối cảnh dùng cho mọi cảnh), đi đường riêng cho cảnh không người.
4. Ghép phim chỉ nén một lần, chất lượng cao.
5. Node Biên kịch: dùng chính chat Muse viết danh sách cảnh + danh sách đồ vật từ một ý tưởng (không tốn API trả phí).

Không làm lần này: cầu nối Muse cho Toonflow; dừng duyệt từng ảnh (chủ dự án đã chọn chạy thẳng); lồng tiếng/phụ đề; video dọc 9:16 (đề xuất riêng sau).

Thất bại dù chạy được: phim vẫn nhựa; đồ vật vẫn đổi hình giữa các cảnh; workflow cũ của chủ dự án mở ra bị hỏng; tốn lượt Muse tạo lại ảnh mẫu đã có.

## 3. Nguồn mở học theo (ghi nguồn trong `NOTICE.md`)

- **Toonflow** (MIT, `packages/skills/v118workflow/references/generateAssets.md`): bộ tài sản nhân vật = mặt cận + chính diện/nghiêng/sau toàn thân; bối cảnh = ảnh chính không người, ánh sáng/tông chốt một lần dùng cho mọi cảnh; đồ vật = ảnh tĩnh vật thật có mặt đỡ và bóng, không tay người; trạng thái đồ vật tạo từ ảnh gốc của chính nó.
- **ViMax** (MIT, `agents/storyboard_artist.py`): tách cảnh thành khung đầu (ảnh chụp, không có hành động đang diễn ra) / chuyển động (tách chuyển động máy và trong khung, gọi nhân vật bằng đặc điểm thấy được) / khung cuối; cảnh đầu là cảnh rộng nhất; nêu vị trí và hướng mặt.
- **Huobao Drama** (CC BY-NC-SA — chỉ học ý tưởng, không chép chữ): biên kịch tự lọc danh sách đồ vật để tạo ảnh mẫu; prompt gọi đích danh ảnh mẫu.

## 4. Thiết kế

### 4.1 Dữ liệu

- `imageset` thêm `look?: string` (câu tông ảnh, chỉ bối cảnh có).
- Cổng mới `props`: `{ kind: "props", items: [{ name, description, images: [{ mediaId, state }] }] }` — ảnh gốc là trạng thái đầu tiên, các trạng thái sau tạo từ ảnh gốc.
- Cổng mới `propspec`: danh sách đồ vật chưa có ảnh (`{ name, description, states[] }`), do Biên kịch xuất.
- Cổng vào có thể **không bắt buộc** (`optional: true`): `planGraph` bỏ qua khi chưa nối. Dùng cho Dựng phim ← Đồ vật và Đồ vật ← Biên kịch.
- `Shot` v2: `{ id, size, angle, move, subject: "character" | "hands" | "none", link, start, motion, props }`; `props` là chuỗi nhiều dòng `tên: trạng thái đầu -> trạng thái cuối` (hoặc chỉ `tên: trạng thái`). Dữ liệu cũ có `action` được đọc thành `start = motion = action` (không vỡ workflow cũ) và bị cảnh báo "khung đầu và chuyển động giống hệt nhau".

### 4.2 Luật đạo diễn mới (khoá cứng trong `checkShotList`, có test)

- Thiếu `motion` → lỗi; thiếu `start` ở cảnh "cắt" → lỗi (cảnh "nối" lấy khung cuối cảnh trước).
- Dòng đồ vật sai cú pháp → lỗi chỉ đúng dòng.
- **Liên tục trạng thái**: đồ vật xuất hiện lại phải ở đúng trạng thái cuối lần trước → lỗi nêu cả hai trạng thái.
- **Hệ quả phải có nguyên nhân**: đồ vật đổi trạng thái trong cảnh mà `subject = none` → lỗi (chọn "Có nhân vật" hoặc "Chỉ thấy tay").
- Khi có danh sách đồ vật (lúc Dựng phim chạy): tên/trạng thái không có trong node Đồ vật → lỗi.
- Giữ các luật cũ (nối tối đa 2 cảnh, cùng chủ thể, luật 30°).

### 4.3 Đường tạo từng cảnh (node Dựng phim)

| Cảnh | Khung đầu | Video |
|---|---|---|
| Nối | khung cuối clip trước (như cũ) | ảnh→video, prompt chuyển động |
| Có nhân vật / chỉ thấy tay | ảnh trong **chat phụ của nhân vật**, đính kèm ảnh bối cảnh chính + ảnh mẫu đồ vật đúng trạng thái đầu (tối đa 3) | ảnh→video |
| Không người, có đồ vật | ảnh mới, đính kèm bối cảnh + đồ vật | ảnh→video |
| Không người, không đồ vật | — | **chữ→video thẳng** (prompt ngắn) |

Prompt (tiếng Việt, gửi nguyên văn, bỏ khuôn tag cũ): ảnh khung = cỡ cảnh/góc máy + khung đầu + đồ vật "giống hệt ảnh mẫu" + bối cảnh + câu tông ảnh + "bối cảnh đơn giản, không chữ"; video = "chỉ tả việc xảy ra sau khung đầu" + chuyển động máy + "chuyển động thật, có lực, đúng vật lý, không nhìn vào máy quay, không thêm người, không cắt cảnh, khung ngang 16:9". Không dùng các chữ "cinematic", "photorealistic", "2K".

### 4.4 Ảnh mẫu

- Nhân vật: mặt cận → chính diện toàn thân → nghiêng toàn thân → sau lưng toàn thân, cùng một chat phụ, nền đơn giản, giọng ảnh điện thoại. Lỗi trong chat → thử chat mới đính kèm ảnh mặt (như cũ).
- Bối cảnh: ảnh chính không người + ảnh cận khu chính; câu "tông ảnh" (mặc định: ảnh điện thoại kiểu vlog, ánh sáng tự nhiên, trời hơi âm u, màu không chỉnh) đi kèm bộ ảnh.
- Đồ vật (node mới): mỗi món một chat phụ: ảnh tĩnh vật trạng thái đầu → các trạng thái sau "chính món đồ trong ảnh vừa tạo, nay …". Các món chạy song song theo số tài khoản.

### 4.5 Kho tài sản dùng chung

- Bảng `assets` (một nơi ghi: `src/features/assets/store.ts`): `cache_key` (khoá), `kind` (character/location/props), `name`, `params_json`, `output_json`, `updated_at`. Executor ghi khi node có `definition.library` chạy xong (kể cả lấy từ cache).
- `GET /api/assets?kind=…` trả danh sách. Mỗi node tài sản có ô "Dùng lại từ kho" (`asset-pick-<id>`): chọn → điền lại đúng tham số → executor trúng cache, **không gọi Muse**.
- Node tài sản có thêm ô Tên.

### 4.6 Biên kịch Muse

- Provider thêm `generateText({ prompt, session? })`: Muse gửi vào chat phụ mới, chờ câu trả lời chữ đứng yên, trả phần sau prompt; dịch vụ giả trả JSON mẫu dựng từ ý tưởng.
- Node `writer` (Biên kịch): tham số ý tưởng, số cảnh (4–24), dịch vụ. Prompt nhúng luật ViMax + luật 4.2, yêu cầu một khối JSON. Đọc JSON → zod → `checkShotList`; sai thì gửi lỗi lại **trong cùng chat** để sửa, tối đa 2 lần, rồi báo lỗi rõ. Ra `shots` (shotlist) và `props` (propspec).
- Node Đồ vật có cổng vào `spec` (không bắt buộc): nối từ Biên kịch thì dùng danh sách đó thay cho danh sách gõ tay.

### 4.7 Ghép phim

- Mã hoá `-preset medium -crf 17`. Bù sáng thôi tạo file trung gian: bước đo độ sáng trả số đo, `concatClips` áp `eq` theo từng clip trong một lần mã hoá.

### 4.8 Mẫu

- "Sinh tồn Sơn La" viết lại theo `Shot` v2 với đồ vật: lều, bếp đá (chưa nhóm → có mồi → đang cháy), gốc cây kê, khúc gỗ (nguyên khúc → bổ đôi), rìu, que đánh lửa.
- Mẫu mới "Ý tưởng → phim (Muse viết kịch bản)": Biên kịch → Đồ vật → Dựng phim (+ Nhân vật, Bối cảnh).

## 5. Ràng buộc

- Theo `CLAUDE.md`: một nơi ghi mỗi loại dữ liệu, `npm run new:node`, `npm run db:generate`, FEATURE_MAP có mọi endpoint và `data-testid`, không gọi Muse thật trong test, `verify:full` xanh trước khi báo xong, ghi lượt Muse vào `TASKS.md`.
- Workflow cũ (Shot có `action`, Dựng phim không nối Đồ vật) vẫn chạy.

## 6. Quyết định do agent tự chốt (chủ dự án xem lại khi đọc)

- Cú pháp đồ vật trong cảnh là chữ nhiều dòng (dễ gõ, dễ đọc) thay vì bảng chọn.
- Đồ vật cố định (lều, bếp đá) cũng là đồ vật có ảnh mẫu — nhờ vậy cảnh flycam có lều đi đường ảnh khung thay vì chữ→video.
- Kho tài sản dựa trên cache theo tham số: chọn từ kho = điền lại tham số, không thêm đường tạo ảnh thứ hai.
- Tông ảnh mặc định ghi ở 4.4; chủ dự án sửa trong node Bối cảnh.
- Biên kịch không có ô sửa tay riêng; muốn sửa thì dùng node Danh sách cảnh gõ tay (đề xuất sau: nút "chép sang Danh sách cảnh").
