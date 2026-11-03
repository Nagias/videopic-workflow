# Đưa ảnh thật vào workflow: sản phẩm affiliate và bối cảnh — thiết kế

Ngày: 03/11/2026. Trao đổi với chủ dự án trong chat 02–03/11/2026. Trạng thái: **chờ chủ dự án duyệt**. Đã qua một lượt đọc thử độc lập (03/11), sửa theo góp ý.

## 1. Vì sao làm

**[Nguyên văn chủ dự án]** (02/11/2026)

> Tôi thấy về cơ bản thì chạy có vẻ sẽ ổn, nhưng tôi cần thêm tính năng import ảnh, ví dụ làm affiliate thì cần thêm ảnh sản phẩm thật vào. Cảnh vật xung quanh và model cũng có thể tự thêm vào, nếu cần generate dựa trên cảnh vật / chủ thể đó thì generate thôi. chứ không phải thuần 100% từ prompt

Video mẫu chủ dự án đưa ra: reel Facebook "Sông Núi Ơi" (`facebook.com/reel/1448740697232437`), dọc 9:16, ~40 giây. Một cô gái ngồi trên ván chèo giữa hồ, nói vào máy, giới thiệu bàn dã ngoại gấp gọn Shinetrip qua các trạng thái: gấp phẳng có bình và cốc → lắp chân → nâng cao → kết hợp ghế → gấp vào túi đen; cuối có nút "Shop now". Chủ dự án muốn làm lại kiểu video này bằng AI để bán hàng.

Chủ dự án đã chốt trong chat:
- **Chủ thể (người) do Muse tạo**, đồ vật làm affiliate thì **đưa ảnh thật vào** (02/11).
- Sẽ cố gắng lấy **ảnh sạch** (không chữ quảng cáo, không ghép nhiều ô) → không làm bước cắt/làm sạch ảnh (02/11).
- Làm lại video mẫu: muốn **cả hai** — app tự xem video mẫu để chép khung kịch bản, và tự gõ ý tưởng cho Biên kịch. Tách làm hai phần, **phần ảnh thật làm trước** (03/11).
- Video dọc 9:16: làm thành **phần riêng ngay sau** phần này (03/11).

Hiện trạng code: ba node ảnh mẫu (Hồ sơ nhân vật, Hồ sơ không gian, Đồ vật) chỉ tạo ảnh từ chữ bằng Muse. Không có chỗ nào đưa file ảnh từ máy vào app. Biên kịch tự nghĩ ra danh sách đồ vật rồi node Đồ vật vẽ theo — chiều ngược với affiliate, nơi sản phẩm thật có trước.

## 2. Mục tiêu / không làm / thất bại dù chạy được

Mục tiêu
1. Node **Đồ vật** cho tải ảnh thật vào **từng trạng thái** của từng món (kéo thả hoặc bấm chọn file, nhiều ảnh mỗi trạng thái). Trạng thái có ảnh thật → dùng luôn, không gọi Muse. Trạng thái chưa có ảnh → Muse vẽ **dựa trên ảnh thật** của chính món đó.
2. Node **Hồ sơ không gian** cho tải ảnh thật bối cảnh. Có ảnh thật → dùng luôn, không gọi Muse.
3. **Biên kịch nhận sản phẩm làm đầu vào**: viết kịch bản xoay quanh đúng sản phẩm, gọi đúng tên và đúng các trạng thái đã có; app tự kiểm, sai thì nhờ Muse sửa trong cùng chat như hiện nay.
4. Từng thẻ Cảnh (nhóm Phân cảnh) nhận được cả sản phẩm có ảnh thật lẫn đồ phụ Biên kịch nghĩ thêm.
5. Ảnh thật vào **kho tài sản** như ảnh Muse vẽ, chọn lại ở workflow khác không phải tải lại, không tốn lượt.

Không làm lần này
- Tải ảnh người thật cho node Hồ sơ nhân vật (chủ dự án chọn để Muse tạo người; Muse từng từ chối một lần khi đính kèm ảnh người thật — `docs/ARCHITECTURE.md` mục 6.1).
- Khung dọc 9:16 (phần riêng, làm ngay sau).
- App tự xem video mẫu và chép khung kịch bản (phần riêng, làm sau).
- Cắt ảnh, xoá nền, xoá chữ trên ảnh tải lên.
- Khuôn kịch bản bán hàng cố định (mở đầu gây chú ý → demo → kêu gọi mua). Chủ dự án tự viết hướng đó vào ô ý tưởng.
- Lồng tiếng, phụ đề, nút mua hàng trong video.

Thất bại dù chạy được
- Sản phẩm trong video khác sản phẩm thật (sai hình dạng, sai màu, mất logo in trên sản phẩm, thêm chi tiết không có).
- Biên kịch dùng trạng thái sản phẩm không có ảnh (vd "bàn gập đôi" khi chỉ có "gấp phẳng") mà app không chặn.
- Sản phẩm chỉ xuất hiện thoáng qua hoặc không xuất hiện.
- Tốn lượt Muse vẽ lại thứ đã có ảnh thật.
- Workflow cũ (không có ảnh thật) mở ra bị hỏng hoặc chạy lại tốn lượt.

## 3. Thiết kế

### 3.1 Tải ảnh lên

- Endpoint mới `POST /api/media/upload`: thân là file ảnh (jpg, png, webp), tối đa **20 MB**. Máy chủ ghi file tạm (`storage.writeTemp`), kiểm bằng `ffmpeg.probeImage`, rồi `storage.importFile` với `kind: "image"`, `source: "upload"`. Trả `{ mediaId, width, height }`.
- File không phải ảnh, sai định dạng (vd HEIC từ iPhone), quá cỡ, hỏng → báo lỗi tiếng Việt rõ ("Ảnh HEIC chưa đọc được, hãy lưu lại thành JPG"), không lưu gì.
- Cùng một ảnh tải hai lần → `importFile` trả lại bản cũ (theo sha256), không nhân đôi file.
- Media route hiện trả mọi ảnh với `Content-Type: image/jpeg`. Ảnh png/webp phải được trả đúng loại, hoặc đổi sang jpg khi nhập — builder chọn, miễn trình duyệt và Muse đều đọc đúng.
- Giao diện gọi qua `src/app/api-client.ts` (đường cấm 5). Endpoint và `data-testid` mới ghi vào `FEATURE_MAP.md` (đường cấm 17).

### 3.2 Node Đồ vật

- Mỗi dòng đồ vật (`PropRow`) thêm trường không bắt buộc `photos`: ảnh thật theo **tên trạng thái** → danh sách `mediaId`. Workflow cũ không có trường này vẫn đọc được.
- Giao diện: dưới ô trạng thái, mỗi trạng thái là một ô nhỏ có nút tải ảnh / vùng kéo thả và ảnh thu nhỏ đã tải, có nút xoá ảnh. Đổi tên trạng thái làm ảnh không còn khớp → ảnh hiện ở mục "ảnh chưa gắn trạng thái" kèm cảnh báo, không tự mất.
- Món có ít nhất một ảnh thật gọi là **sản phẩm** (món khoá cứng). Thẻ node ghi rõ số ảnh thật và số ảnh sẽ vẽ, vd "Bàn gấp · 3 ảnh thật · 1 ảnh vẽ".
- Khi chạy, với từng món:
  - Trạng thái có ảnh thật → ảnh thật vào kết quả (`images: [{ mediaId, state }]`, ảnh đầu tiên của trạng thái đứng trước), không gọi Muse.
  - Trạng thái chưa có ảnh, món có ảnh thật ở trạng thái khác → Muse vẽ trong chat mới, đính kèm ảnh thật (ưu tiên ảnh của trạng thái đầu tiên có ảnh), prompt "chính món trong ảnh đính kèm, giữ nguyên hình dạng, màu, chất liệu, logo in trên sản phẩm, nay ở trạng thái …". Các trạng thái chưa có ảnh tiếp theo vẽ nối tiếp trong cùng chat như hiện nay.
  - Món không có ảnh thật nào → như hiện nay.
- Khoá cache bước con (`propStepKey`) của trạng thái vẽ thêm phải chứa mã ảnh thật đính kèm: đổi ảnh thật → vẽ lại; không đổi → dùng lại, không tốn lượt.
- Ước tính lượt Muse chỉ đếm trạng thái **chưa có ảnh thật**.
- Kho tài sản: tham số lưu kèm `photos`, chọn lại ở workflow khác ra đúng ảnh thật. Lưu ý: `storedParams()` (`src/features/assets/store.ts`) hiện dựng lại `items` từ kết quả và ghi đè tham số → phải giữ `photos` khi dựng lại.
- Ảnh thật đổi sang jpg khi nhập (nếu builder chọn đổi) **không** bị cắt về 16:9 như ảnh Muse — giữ nguyên khung ảnh gốc.
- Nhiều ảnh trong một trạng thái: ảnh khung từng cảnh chỉ đính kèm ảnh đầu tiên (giữ ngân sách `MAX_PROP_REFS = 2` ảnh đồ vật mỗi cảnh); khi Muse vẽ trạng thái còn thiếu thì đính kèm tối đa 2 ảnh thật của trạng thái gốc để Muse nắm hình dạng. *(Quyết định của agent.)*

### 3.3 Node Hồ sơ không gian

- Thêm `photos?: string[]` (mã ảnh thật). Mô tả và tông ảnh vẫn bắt buộc như hiện nay (Biên kịch và prompt từng cảnh vẫn đọc mô tả bằng chữ).
- Có ảnh thật → kết quả `imageset` lấy ảnh thật: ảnh 1 là góc `wide` (góc mà ảnh khung từng cảnh đính kèm), ảnh 2 (nếu có) là góc gần. Không gọi Muse, ước tính 0 lượt.
- Không có ảnh → như hiện nay.

### 3.4 Biên kịch nhận sản phẩm

- Thêm cổng vào không bắt buộc **"Sản phẩm"** (kiểu `props`), nối từ node Đồ vật có ảnh thật. **Mọi món** trong node nối vào cổng này đều tính là sản phẩm; món nào chưa có ảnh thật thì thẻ node cảnh báo. Không thêm cờ "ảnh thật" vào kiểu dữ liệu cổng. *(Quyết định của agent.)*
- Prompt Biên kịch thêm một đoạn: sản phẩm chính đã có ảnh thật, giữ nguyên tên, **chỉ được dùng đúng các trạng thái sau**; liệt kê tên, mô tả, trạng thái. Đồ phụ khác (bình nước, cốc…) Biên kịch vẫn tự thêm vào danh sách `props` của nó.
- Kiểm câu trả lời (`parseWriterReply`) thêm luật, sai thì nhờ sửa như các luật hiện có:
  - Tên và trạng thái đồ vật trong từng cảnh phải có trong **sản phẩm + đồ phụ** (dùng lại `checkShotList` với danh sách gộp).
  - Đồ phụ không được trùng tên sản phẩm (Biên kịch không được định nghĩa lại sản phẩm).
  - Sản phẩm xuất hiện ở **ít nhất một nửa số cảnh (làm tròn lên) và bắt buộc có trong cảnh cuối** (chủ dự án chọn 03/11/2026). "Xuất hiện" = trường đồ vật của cảnh có tên một sản phẩm. Có nhiều sản phẩm thì đếm cảnh có ít nhất một sản phẩm. Lời nhắc luật này cũng ghi vào prompt Biên kịch để Muse viết đúng ngay lần đầu, đỡ lượt sửa.
- Cổng ra `props` (danh sách đồ vật) của Biên kịch chỉ chứa **đồ phụ**, để node Đồ vật nối từ Biên kịch không vẽ lại sản phẩm bằng Muse.
- Khoá cache Biên kịch đổi theo sản phẩm (đã đúng sẵn vì prompt chứa sản phẩm).

### 3.5 Thẻ Cảnh và Ghép phim nhận sản phẩm

Đường dựng phim hiện tại: Biên kịch sinh nhóm "Phân cảnh" gồm các node **Cảnh** (`src/nodes/scene/`, `expandScenes` / `rebuildWriterGroup` trong `src/shared/scenes.ts`) rồi **Ghép phim** (`src/nodes/film-combine/`). Node Dựng phim (`film`) đã ẩn, không sửa.

- Node **Cảnh** thêm cổng vào thứ hai, không bắt buộc, **"Sản phẩm"** (kiểu `props`). Không đổi cổng `props` cũ thành nhiều dây, để workflow cũ và ảnh chụp nhóm đã lưu (`snapshotGroup`) giữ nguyên. *(Quyết định của agent.)*
- Cảnh gộp sản phẩm + đồ phụ thành một danh sách món trước khi kiểm luật (`checkShotList`) và chọn ảnh đính kèm (`propsInFrame`). Trùng tên giữa hai nguồn → lỗi rõ. Ảnh sản phẩm xếp **trước** đồ phụ khi chọn tối đa 2 ảnh đồ vật mỗi cảnh.
- `expandScenes` / `rebuildWriterGroup` tự nối node đang cắm vào cổng "Sản phẩm" của Biên kịch tới cổng "Sản phẩm" của **mọi** thẻ Cảnh sinh ra (thêm vào danh sách `REF_PORTS` hoặc tương đương).
- **Ghép phim** (`scenesFeeding`): bước kiểm luật trước khi chạy đọc danh sách món từ cả node sản phẩm lẫn node đồ phụ. Giới hạn đã ghi ở `DEBT.md` N-015 (đồ phụ từ Biên kịch chưa biết trước khi chạy) giữ nguyên, nhưng sản phẩm thì đã biết trước nên kiểm được.
- Workflow cũ không có cổng "Sản phẩm" chạy như cũ, khoá cache các cảnh cũ không đổi.

### 3.6 Prompt giữ logo sản phẩm

Prompt ảnh hiện có câu "không chữ, không logo" (`STILL_RULES`, `propStillPrompt`, `propStatePrompt`). Với sản phẩm có ảnh thật, câu này có thể làm Muse xoá logo in trên sản phẩm (vd chữ Shinetrip trên túi). Cảnh có sản phẩm đổi thành: giữ nguyên chữ và logo **in trên sản phẩm** như ảnh đính kèm, không thêm chữ nào khác vào khung. Áp dụng cho cả prompt ảnh **và prompt video** (`VIDEO_RULES` trong `motionPrompt`, vì bước biến ảnh thành video cũng có thể xoá logo). Cảnh không có sản phẩm giữ **nguyên từng chữ** prompt cũ để cache các cảnh cũ vẫn trúng. Mọi prompt vẫn nằm ở `src/shared/prompts.ts`.

### 3.7 Workflow mẫu

Sơ đồ nối cho video affiliate:

```
Hồ sơ nhân vật ──────────────┐
Hồ sơ không gian (ảnh thật) ─┼─► Biên kịch ──► nhóm Phân cảnh: Cảnh 1 … Cảnh N ──► Ghép phim
Đồ vật "sản phẩm" (ảnh thật) ┘       │            ▲ mỗi Cảnh tự được nối: nhân vật,
                                     └─(đồ phụ)─► Đồ vật ──┘  không gian, đồ phụ, sản phẩm
```

Bối cảnh có ảnh thật: cảnh không người, không đồ vật vẫn đi đường chữ→video như hiện nay (quyết định 28/10/2026, `docs/ARCHITECTURE.md` mục 6.2), nên những cảnh đó **không bám ảnh bối cảnh thật**. *(Quyết định của agent: giữ nguyên, ghi rõ để chủ dự án biết.)*

## 4. Kiểm chứng

- Test đơn vị (dịch vụ `fake`): tải ảnh hợp lệ / sai định dạng / quá cỡ / trùng; Đồ vật đủ ảnh thật → 0 lượt, thiếu một trạng thái → 1 lượt có đính kèm ảnh thật, đổi ảnh → khoá cache đổi; Không gian có ảnh → 0 lượt; Biên kịch dùng trạng thái lạ / định nghĩa lại sản phẩm / bỏ quên sản phẩm → bị bắt; Biên kịch có cổng Sản phẩm → mọi thẻ Cảnh sinh ra được nối sản phẩm; Cảnh gộp sản phẩm + đồ phụ, trùng tên → lỗi, ảnh sản phẩm được đính kèm trước; workflow cũ mở ra không đổi khoá cache.
- e2e (Playwright, dịch vụ `fake`): tải ảnh vào một trạng thái trên giao diện, chạy workflow mẫu 3.7, thấy ảnh thật trên thẻ node và trong cảnh.
- Muse thật (tốn lượt, ghi `TASKS.md`): một sản phẩm thật với 2 ảnh trạng thái + 1 trạng thái vẽ thêm, Biên kịch 4–6 cảnh, dựng phim. Xem bằng mắt: sản phẩm giống ảnh thật, logo còn. Ước khoảng 10–15 lượt.

## 5. Để builder tự quyết

- Cách gửi file lên (thân nhị phân hay multipart) và có cần thêm thư viện hay không (ưu tiên không thêm).
- Bố cục chi tiết ô tải ảnh trong khung bên phải, miễn có kéo thả và bấm chọn file.
- Tên trường, tên hàm, cách tách file (theo khuôn node hiện có, `npm run new:node` nếu cần node mới — thiết kế này không cần node mới).
