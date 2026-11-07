# Phim hoạt hình có đạo diễn: phong cách phim, dàn nhân vật, ý tưởng → dàn ý → kịch bản liền mạch — thiết kế

Ngày: 06/11/2026. Trao đổi với chủ dự án trong chat 06/11/2026. Trạng thái: **chủ dự án giao agent tự quyết** (xem nguyên văn cuối mục 1). Mọi quyết định thiết kế dưới đây là **[Đề xuất của agent — chưa duyệt]** trừ chỗ ghi nguyên văn.

## 1. Vì sao làm

Chạy thử phim hoạt hình "Mèo và 3 con gián" 30 giây (workflow `meo-va-3-con-gian`, nhật ký `TASKS.md`).

**[Nguyên văn chủ dự án]** (06/11/2026, sau khi xem phim)

> Tôi xem video thì thấy con gián to quá mức, to còn ngang con mèo, mà nét vẽ thì không cartoon chút nào, với cả cũng không có các hành động giống trong phim hoạt hình. Tiếp theo thì cái bánh quy cũng rất to rồi lại hóa nhỏ lại. Các cảnh không có liên kết với nhau, chưa thành 1 phim cụ thể. Tôi nghĩ là workflow làm tốt ở việc nối các video lại với nhau, nhưng chưa tạo ra được sự logic, liền mạch giữa các prompt để ra video. Vì thế mà hành động mỗi video lại 1 kiểu, đồ vật cũng không giữ nguyên mà lại thay đổi liên tục về vị trí, kích thước.

**[Nguyên văn chủ dự án]** (06/11/2026, hình mẫu)

> bạn có thể tìm kiếm về oggy và những chú gián tinh nghịch, tom & jerry, larva. Những bộ phim này thoạt qua thì vô tri, tập nào cũng lặp lại 1 kiểu nội dung là có 01 đôi động vật hay cạnh tranh nhau nhưng bối cảnh, nội dung của tập đó thì thay đổi liên tục. đó là sự sáng tạo của con người và cần yếu tố đạo diễn tốt mới làm được

> Tôi muốn app có thể đề xuất kịch bản như 1 đạo diễn hoặc nhận ý tưởng từ tôi để generate ra 1 bộ phim dài tầm 3 phút

> Có, tôi sẽ xem qua kịch bản chứ. Còn bạn không lo tốn muse đâu, tôi có rất nhiều token

Chủ dự án chọn kiểu duyệt **C** trên bản phác (`.superpowers/brainstorm/`): app đưa 3 ý tưởng tập phim để chọn (hoặc gõ ý tưởng riêng) → dàn ý 3 phần để duyệt → mới viết các cảnh.

> Này bạn tự nghĩ chứ sao lại hỏi tôi, bạn là đạo diễn mà. Đừng hỏi tôi nữa, bạn tự động làm hết đi, tôi nhận output thôi

### 1.1 Nguyên nhân đo được (đối chiếu prompt thật đã gửi Muse)

| Lỗi chủ dự án thấy | Nguyên nhân trong code / workflow |
|---|---|
| Gián to ngang mèo | Ảnh mẫu nhân vật đã vẽ gián cao gần nửa con mèo; mô tả chỉ ghi "nhỏ", app không có chỗ khai báo tỉ lệ giữa nhân vật |
| Nét vẽ không hoạt hình | `CHARACTER_SHEET` luôn dùng `DEFAULT_LOOK` ("Ảnh chụp bằng điện thoại như khung hình vlog"), "Da thật có lỗ chân lông", nền "tường xi măng ngoài trời" |
| Không có hành động kiểu hoạt hình | `VIDEO_RULES` luôn kèm "Chuyển động thật, có lực, đúng vật lý; chỉ làm đúng việc đã tả" |
| Bánh quy to rồi nhỏ | Bánh quy không khai báo là đồ vật; mà `propStillPrompt` cũng cứng "ảnh chụp thật … mặt đất thật" |
| Cảnh không liên kết | Prompt mỗi cảnh cắt chỉ tả khoảnh khắc của nó; không ai theo dõi cuối cảnh trước ai ở đâu, đồ vật ở đâu, cỡ nào. Cảnh 1 (không người) là chữ → video, không đính ảnh bối cảnh nên bếp khác hẳn. Ai có mặt trong khung không được nói rõ (cả dàn bị vẽ vào mọi cảnh) |

## 2. Mục tiêu / không làm / thất bại dù chạy được

Mục tiêu
1. **Phong cách phim** chọn một lần, chạy qua mọi prompt: ảnh mẫu nhân vật, bối cảnh, đồ vật, ảnh khung, luật chuyển động video, luật viết kịch bản.
2. **Dàn nhân vật**: nhiều nhân vật trong một node, mỗi con có ngoại hình, **kích thước thật (cm) và tỉ lệ so với con khác**, tính cách; kèm **luật loạt phim** (kiểu luật Chuck Jones) dùng lại cho mọi tập.
3. **Luồng duyệt C**: node Ý tưởng tập (3 ý tưởng hoặc ý tưởng riêng) → node Dàn ý (3 phần: gây chuyện, leo thang, chốt) → Biên kịch viết cảnh. Mỗi bước chạy riêng được (chạy một node), sửa được (gõ đè), chỉ tốn lượt chữ.
4. **Phim ~3 phút** = 36 cảnh × 5 giây. Biên kịch viết theo từng đợt ≤ 12 cảnh trong cùng một chat để câu trả lời không quá dài.
5. **Liền mạch**: mỗi cảnh có "ai trong khung" và "cuối cảnh" (ai ở đâu, đồ vật ở đâu, cỡ nào); khung đầu cảnh sau phải khớp cuối cảnh trước; app kiểm tên nhân vật, nhờ Muse sửa khi sai.
6. **Mẫu workflow** "Phim hoạt hình 3 phút" chạy được bằng một lần bấm (và chạy từng bước để duyệt).

Không làm lần này
- Lồng tiếng, phụ đề, nhạc nền riêng (Muse tự tạo tiếng trong clip, giữ như hiện nay).
- Khung dọc 9:16.
- Nhiều bối cảnh trong một tập (một node Không gian cho mỗi tập; tập sau đổi bối cảnh thì sửa node đó).
- Sao chép nhân vật/hình dáng của Oggy, Tom & Jerry, Larva. Chỉ học công thức kể chuyện.
- Màn hình riêng ngoài canvas cho luồng duyệt (luồng C làm bằng node trên canvas).

Thất bại dù chạy được
- Workflow cũ (Sơn La, nồi cơm, người thật) đổi kết quả, tốn lượt lại, hoặc thẻ cũ hiện "chưa chạy".
- Phim hoạt hình vẫn có nhân vật to nhỏ lung tung, đồ vật đổi cỡ giữa các cảnh, hoặc hành động không cường điệu.
- Kịch bản 36 cảnh bị Muse cắt cụt, app vẫn báo xong.

## 3. Thiết kế

### 3.1 Phong cách phim — `src/shared/styles.ts`

`FILM_STYLES`: `thuc` (Người thật, vlog — hành vi hiện tại, không đổi một chữ prompt nào), `hoat-hinh-3d`, `hoat-hinh-2d`. Mỗi kiểu hoạt hình có: câu tông hình (look), luật ảnh tĩnh, luật chuyển động (cường điệu kiểu hoạt hình: lấy đà, co giãn, phản ứng giữ lâu, trọng lực là kẻ thù, bị bẽ mặt không bị thương, không lời thoại), nền ảnh mẫu.

Phong cách đi theo dữ liệu: bộ ảnh (`imageset`) của Dàn nhân vật và Không gian, danh sách đồ vật (`propspec`, `props`) có trường `style` (vắng = `thuc`). Nơi chọn: node Dàn nhân vật (`style`), node Không gian (`style`, mặc định `thuc`), node Đồ vật gõ tay (`style`, mặc định `thuc`; nối từ Biên kịch thì lấy theo Biên kịch). Khoá cứng: Cảnh và Biên kịch báo lỗi trước khi chạy nếu nhân vật và không gian khác phong cách.

### 3.2 Prompt hoạt hình — `src/shared/cartoon-prompts.ts` (file mới)

Mọi prompt hoạt hình nằm trong file này; `prompts.ts` không sửa hàm cũ. `CARTOON_VERSION = codeVersion(<mọi hàm xuất ra của file>)`, đưa vào `cacheVersion` của node Dàn nhân vật. Mọi node dùng prompt hoạt hình (Ý tưởng, Dàn ý, Biên kịch chế độ hoạt hình, Cảnh hoạt hình, Đồ vật hoạt hình nối từ Biên kịch) đều nằm phía sau Dàn nhân vật, nên sửa prompt hoạt hình là khoá của cả chuỗi đổi theo; workflow người thật không dính. Test kiến trúc: mọi hàm xuất ra của file đều có trong `CARTOON_VERSION`.

Gồm: bộ ảnh mẫu dàn nhân vật (ảnh xếp hàng đúng tỉ lệ + cận từng con, nối tiếp trong một chat), tông bối cảnh, ảnh đồ vật hoạt hình (ghi kích thước so với nhân vật), ảnh khung (ai trong khung, ai không có, nhắc tỉ lệ), video (luật chuyển động hoạt hình + cuối cảnh), ý tưởng tập, dàn ý, biên kịch theo đợt, lời nhờ sửa.

### 3.3 Node mới

| Node | Vào | Ra | Tham số | Tốn |
|---|---|---|---|---|
| `cast` Dàn nhân vật | — | `character` (imageset, role character, `style`, `members`) | tên, phong cách, nhân vật (tên, ngoại hình, cỡ thật, tính cách; 1–6), luật loạt phim | 1 ảnh xếp hàng + 1 ảnh mỗi nhân vật |
| `ideas` Ý tưởng tập phim | `character`, `location` (tuỳ chọn) | `idea` (text), `options` (text) | gợi ý, chọn 1–3, ý tưởng riêng | 1 lượt chữ; có ý tưởng riêng thì 0 |
| `outline` Dàn ý tập phim | `idea`, `character`, `location` (tuỳ chọn) | `outline` (kiểu mới `outline`: chữ + số cảnh) | số cảnh 12–36, dàn ý gõ đè | 1 lượt chữ; gõ đè thì 0 |

### 3.4 Sửa node có sẵn (không đổi hành vi cũ)

- **Biên kịch**: thêm cổng vào `outline` (tuỳ chọn). Nhân vật nối vào là Dàn nhân vật hoạt hình, hoặc có dàn ý → chế độ hoạt hình: viết theo đợt ≤ 12 cảnh trong cùng chat, mỗi cảnh thêm `cast` (ai trong khung) và `end` (cuối cảnh). Số cảnh lấy từ dàn ý. Ý tưởng chỉ bắt buộc khi không có dàn ý (kiểm trước khi chạy). Tối đa 36 cảnh. Không có hai thứ trên: đúng prompt và khoá cũ.
- **Cảnh**: tham số thêm `cast`, `end` (tuỳ chọn). Nhân vật có `style` hoạt hình → prompt hoạt hình; cảnh không người vẫn vẽ ảnh khung từ ảnh bối cảnh (không chữ → video). Không có `style`: đúng đường cũ.
- **Không gian**: tham số `style`; hoạt hình thì tông ảnh = tông hoạt hình + tông riêng của bối cảnh.
- **Đồ vật**: `style` lấy từ Biên kịch hoặc tham số; hoạt hình → prompt đồ vật hoạt hình.
- `Shot` thêm `cast?`, `end?`; `expandScenes()` chép sang thẻ Cảnh.

### 3.5 Mẫu "Phim hoạt hình 3 phút"

Dàn nhân vật (mèo Mướp + 3 gián, gián cao bằng 1/6 mèo) + Không gian (bếp hoạt hình) → Ý tưởng tập → Dàn ý (36 cảnh) → Biên kịch → Đồ vật → nhóm Phân cảnh rỗng (tự sinh 36 thẻ khi Biên kịch xong) → Ghép phim. Dịch vụ Muse.

## 4. Kiểm chứng

- Unit test: prompt hoạt hình (có tỉ lệ, không có "ảnh chụp thật"), đọc ý tưởng/dàn ý, biên kịch theo đợt (dịch vụ giả), khoá cache (workflow người thật giữ nguyên khoá — test so khoá trước/sau), luật cùng phong cách.
- e2e: tạo từ mẫu mới, chạy trọn bằng dịch vụ giả ra phim 36 cảnh.
- Muse thật: chạy mẫu mới ra phim ~3 phút; ffprobe; xem khung giữa và khung cuối mọi cảnh; ghi nhật ký `TASKS.md`.
