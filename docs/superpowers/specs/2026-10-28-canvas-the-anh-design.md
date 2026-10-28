# Canvas thẻ ảnh kiểu Magnific / Higgsfield / ComfyUI — thiết kế

Ngày: 28/10/2026. Trạng thái: chờ chủ dự án duyệt.

Tài liệu đi kèm:
- Kết quả soi giao diện và mã nguồn mở: `docs/superpowers/research/2026-10-28-soi-giao-dien-higgsfield-magnific.md`.
- Bản phác bấm thử được (chủ dự án đã xem, trả lời "Đúng hướng, viết thiết kế"): `.superpowers/brainstorm/4475-1793197854/content/canvas-v1.html`. Thư mục này nằm trong `.gitignore` vì chứa ảnh thật của chủ dự án, repo lại công khai. Bản phác chỉ có trên máy này, mở qua máy chủ bản phác của skill brainstorming, hoặc mở thẳng file HTML (ảnh khi đó sẽ không hiện).

## 1. Vì sao làm

Lời chủ dự án, 28/10/2026:
- "UI UX thì rất khó dùng. Tạo node mới không kết nối được, quá dày đặc chữ mà không có tạo thành kiểu từng ảnh như flow cơ bản."
- "bạn hãy tìm kiếm cách higgfield, magnitic, comfyui thiết kế UI UX để làm tương tự cho tôi là được"
- "Phác thảo giao diện nhưng cũng phải có đầy đủ tính năng chứ"

Mục đích dự án (`CLAUDE.md` mục 1) cần workflow kéo–nối giống Higgsfield, ComfyUI, Magnific để làm video dài từ nhiều clip Muse nối nhau. Đích gần là video khoảng 2 phút.

Hiện trạng đo trên app (28/10/2026, workflow Sơn La):
- Node Danh sách cảnh có 94 ô nhập, khoảng 756 chữ. Node Đồ vật cao hơn 1000 điểm ảnh.
- Mỗi cảnh chỉ là một dòng trong bảng chữ, không phải một thẻ ảnh.
- Chỉ có 2/7 loại cổng mang màu riêng. Prompt chỉ cắm được vào Tạo video, còn video ra thì không cắm tiếp vào đâu được.
- PR #6 (đã gộp) đã sửa phần nhỏ: hiện lại kết quả lần chạy trước, báo lý do khi nối sai, màu cổng và dây theo loại, node mới đặt giữa màn hình.

## 2. Mục tiêu / không làm / thất bại dù chạy được

**Mục tiêu**
1. Canvas trông và dùng như Magnific Spaces và Higgsfield Canvas:
   - Node là thẻ ảnh hoặc video lớn, nhãn nhỏ nằm phía trên thẻ.
   - Thông số sửa ở khung bên phải.
   - Thêm node bằng ô tìm, hoặc kéo dây từ cổng ra chỗ trống.
   - Có menu chuột phải và phím tắt.
2. **Mỗi cảnh là một node riêng**: sửa riêng, chạy riêng, có lịch sử kết quả riêng. Cảnh sau nối từ clip cảnh trước bằng một dây thật.
3. Có đủ các khối để làm video dài: lấy khung hình, kéo dài video, ghép phim, tải ảnh hoặc video lên, dùng lại từ kho.
4. Luôn biết trước sẽ tốn bao nhiêu lượt Muse, và chạy được riêng một phần workflow.
5. Đủ tính năng theo bảng ở mục 8, chia làm 3 đợt.

**Không làm**
- Cộng tác nhiều người, bình luận, chia sẻ link: dự án chỉ có một người dùng.
- Node 3D, SVG, chỉnh mặt nạ, và các node Magnific khác không phục vụ video Muse.
- Bản desktop (Electron).
- Đổi dịch vụ tạo ảnh/video. Vẫn dùng Muse và dịch vụ giả.

**Thất bại dù chạy được**
- Mở workflow cũ (Sơn La, Ý tưởng → phim) thì bị hỏng, mất kết quả, hoặc **phải gọi lại Muse cho những cảnh đã xong**.
- Giao diện mới vẫn dày chữ: thẻ trên canvas lại chứa form.
- Bấm Chạy mà không biết trước số lượt Muse, hoặc tốn lượt oan (chạy lại cảnh không đổi gì, lỡ tay chạy cả workflow).
- Chất lượng video tụt so với bây giờ: mất các luật và đường tạo cảnh đã thử thật (mục 5.3).
- Kéo thả, phóng to thu nhỏ bị giật với khoảng 30 node.

## 3. Ràng buộc

- Mọi quy tắc trong `CLAUDE.md`:
  - Khoá cứng ESLint: không đọc `process.env` rải rác, giao diện chỉ gọi máy chủ qua `api-client.ts`, file dùng chung không import code máy chủ hay giao diện.
  - Registry node sinh bằng `npm run new:node` / `gen:nodes`.
  - Mọi endpoint và `data-testid` phải có trong `FEATURE_MAP.md`.
  - Ghi media chỉ qua `storage.importFile`. Test không gọi Muse thật.
  - Mỗi đợt một nhánh, một PR, `npm run verify:full` xanh.
- Giữ bộ công nghệ hiện có: React 19, @xyflow/react 12.12, Vite, Fastify, SQLite (drizzle), ffmpeg. **Không thêm Tailwind, Zustand hay thư viện giao diện lớn.** Thêm thư viện nhỏ thì phải nêu lý do trong PR.
- Máy chủ dev là `tsx watch`: sửa file máy chủ trong lúc Muse đang chạy là mất lượt. Thử Muse thật thì chạy bằng máy chủ không watch.
- Repo `Nagias/videopic-workflow` là repo công khai: không commit ảnh hay video của chủ dự án.

## 4. Đã quyết

Của chủ dự án:
- Hướng giao diện theo bản phác `canvas-v1.html`, làm tương tự Magnific / Higgsfield / ComfyUI.
- "Phải có đầy đủ tính năng": bảng mục 8 là phạm vi.
- Mã nguồn có giấy phép không cho thương mại vẫn dùng được, vì chỉ dùng cá nhân (`CLAUDE.md` mục 1).

Của agent (chủ dự án duyệt cùng tài liệu này):
- **Học Node Banana, không bê nguyên.** [Node Banana](https://github.com/shrimbly/node-banana) (MIT) cùng nền React 19 + @xyflow/react 12, nhưng dính chặt vào Tailwind, Zustand và Next.js. Nên học bố cục và hành vi của nó: thẻ node, menu khi thả dây, ô tìm node, xem lại các lần tạo. Đoạn nào là logic thuần (không dính Tailwind, Zustand) thì được chép, kèm ghi nguồn trong `NOTICE.md`. Tersa (MIT) và BeatDesign (Apache-2.0) dùng để tham khảo thêm.
- **Mỗi cảnh là một node thật**, không chỉ vẽ tách ra trên giao diện. Lý do: kéo dài video, lấy khung cuối thành cảnh mới, chạy riêng một cảnh và lịch sử từng cảnh đều cần cảnh là một node. Cái giá là phải nâng bộ máy chạy (mục 6).
- **Lịch sử kết quả dùng tham số "lần tạo" (`take`)** thay vì thêm cơ chế lưu mới (mục 6.4). Tham số `take` và lệnh "Chạy lại (bản mới)" làm luôn trong đợt 1. Lý do: Muse hay ra clip hỏng (nhật ký `TASKS.md`), mà thiếu lệnh này thì chạy lại một cảnh không đổi chữ sẽ luôn trúng cache. Phần xem và chọn lại bản cũ (dải "‹ 2/3 ›", API danh sách bản) để sang đợt 2.
- **Mỗi lúc chỉ một lần chạy.** Bấm chạy trong lúc đang có lần chạy khác thì yêu cầu mới được xếp hàng, hiện trong ô hàng chờ, huỷ được. Hàng đợi hiện có (`queue.ts`) giữ nguyên cách chạy từng run một. Riêng khoá chat nhân vật và cầu dao vẫn làm ở mức toàn máy chủ (khoá theo đường dẫn chat), để sau này cho chạy nhiều run song song thì không phải sửa lại.
- **Sửa một cảnh thì các cảnh nối phía sau cũng chạy lại.** Khung đầu của cảnh nối lấy từ khung cuối clip trước, nên clip trước đổi thì cảnh nối phải tạo lại cho khớp, giống cách Dựng phim làm bây giờ. Hộp ước tính lượt phải ghi rõ các cảnh nối bị kéo theo.

## 5. Mô hình node

### 5.1 Loại dữ liệu ở cổng

Giữ các loại đang có. Thêm loại `image` (một ảnh) và `audio` (để sẵn cho đợt 3). Mỗi loại một màu, áp cho chấm cổng, chữ loại cổng và dây:

| Loại | Màu (gợi ý) | Ghi chú |
|---|---|---|
| Chữ `text` | tím | cổng vào kiểu chữ nhận nhiều dây (như Higgsfield) |
| Ảnh `image` | cam | mới |
| Video `video` | xanh ngọc | |
| Bộ ảnh tham chiếu `imageset` | vàng | nhân vật, bối cảnh |
| Đồ vật `props`, danh sách đồ vật `propspec` | hồng, vàng nhạt | |
| Danh sách cảnh `shotlist` | xanh dương | |
| Âm thanh `audio` | hồng đậm | đợt 3 |

### 5.2 Danh sách node

| Node | Đợt | Cổng vào | Cổng ra | Thẻ trên canvas hiện gì | Thay cho |
|---|---|---|---|---|---|
| Văn bản / Prompt | 1 | — | Chữ | đoạn chữ (cắt bớt) | Prompt |
| Nhân vật | 1 | — | Bộ ảnh | lưới 2×2 bốn góc | Hồ sơ nhân vật |
| Bối cảnh | 1 | — | Bộ ảnh | ảnh toàn cảnh + ảnh cận | Hồ sơ không gian |
| Đồ vật | 1 | Danh sách đồ vật (không bắt buộc) | Đồ vật | lưới ảnh nhỏ | Đồ vật |
| Biên kịch (Muse chữ) | 1 | Chữ, Nhân vật, Bối cảnh (không bắt buộc) | Danh sách cảnh, Danh sách đồ vật | tóm tắt "12 cảnh · 60 giây" + nút **Tạo thẻ cảnh** | Biên kịch |
| **Cảnh** | 1 | Nhân vật, Bối cảnh, Đồ vật (không bắt buộc), **Nối tiếp** (Video, không bắt buộc), **Khung đầu** (Ảnh, không bắt buộc) | Clip (Video), Khung cuối (Ảnh) | ảnh khung đầu 16:9, nhãn "Cảnh 3 · MS · cắt", một dòng chuyển động, thời lượng | một dòng của Danh sách cảnh + phần chạy cảnh trong Dựng phim |
| **Ghép phim** | 1 | Clip (Video, **nhận nhiều dây, có thứ tự**), Nhạc (Âm thanh, đợt 3) | Phim (Video) | trình phát phim | phần ghép trong Dựng phim |
| Tạo video từ chữ | 1 | Chữ | Video | trình phát | Tạo video |
| Ghi chú dán | 2 | — | — | khối chữ màu vàng, không chạy | — |
| Tải ảnh lên / Tải video lên | 2 | — | Ảnh / Video | ảnh / video | — |
| Từ kho | 2 | — | Bộ ảnh / Đồ vật | như node gốc | ô "Dùng lại từ kho" hiện có |
| Lấy khung hình | 2 | Video | Ảnh | ảnh | `frameOf()` trong Dựng phim |
| Kéo dài video | 2 | Video, Chữ (không bắt buộc) | Video | trình phát | — (thực chất là Cảnh có sẵn dây Nối tiếp) |
| Video khung đầu–cuối | 3 | Ảnh đầu, Ảnh cuối, Chữ | Video | trình phát | — (phải thử Muse trước) |
| Cắt video | 3 | Video | Video | trình phát + thanh cắt | — |
| Dòng thời gian | 3 | Video (nhiều dây) | Video | dải clip | — |
| Chỉnh màu đồng bộ | 3 | Video, Ảnh mẫu | Video | trình phát | bù sáng hiện có |
| Nhạc nền, Lồng tiếng, Trộn tiếng | 3 | … | Âm thanh / Video | | — |
| So sánh | 3 | 2 Ảnh hoặc Video | — | hai bản cạnh nhau | — |
| Danh sách → chạy hàng loạt | 3 | Chữ (nhiều dòng) | Danh sách | | — |
| Xuất file | 2 | Video / Ảnh | — | tên file, nút mở thư mục | `.data/exports` hiện làm tay |

Node Dựng phim và Danh sách cảnh cũ bị bỏ khỏi danh sách thêm node. Workflow cũ được tự chuyển sang node mới (mục 7).

### 5.3 Node Cảnh: phải giữ nguyên chất lượng hiện có

Mọi thứ trong `src/nodes/film/run.ts` và `src/shared/prompts.ts` đã thử thật (nhật ký trong `TASKS.md`) đều phải giữ nguyên hành vi:
- **Bốn đường tạo cảnh** (`FEATURE_MAP.md` mục 4.2):
  - Cảnh nối: lấy khung cuối clip trước làm khung đầu.
  - Cảnh có người hoặc chỉ thấy tay: tạo ảnh khung trong chat phụ của nhân vật, đính kèm ảnh bối cảnh và ảnh mẫu đồ vật đúng trạng thái.
  - Cảnh không người nhưng có đồ vật: tạo ảnh mới.
  - Cảnh không người, không đồ vật: đi thẳng chữ→video.
- **Prompt**: `keyframePrompt`, `motionPrompt` (có trang phục), `textVideoPrompt`, và `cacheVersion` theo phiên bản prompt.
- **Chat phụ của nhân vật chỉ làm từng việc một.** Hiện việc này do `semaphore(1)` nằm bên trong node Dựng phim đảm bảo. Khi mỗi cảnh thành một node riêng, khoá phải chuyển ra ngoài, khoá theo đường dẫn chat của nhân vật, dùng chung cho mọi node trong cùng lần chạy.
- **Cầu dao**: dịch vụ báo lỗi máy chủ `SERVICE_FAILURE_LIMIT` (3) lần thì dừng gửi thêm, tính chung cho cả lần chạy chứ không còn tính riêng từng node.
- **Kiểm luật trước khi tốn lượt**: `checkShotList` cùng danh sách đồ vật chạy trên chuỗi cảnh theo thứ tự của Ghép phim, **trước khi gọi Muse lần nào**. Có lỗi thì không gửi gì, lỗi hiện ở thẻ cảnh liên quan.
- **Cắt đầu clip nối** (`CHAIN_TRIM_SEC`), **bù sáng** (đo trong Cảnh, áp ở Ghép phim, chỉ nén một lần `ENCODE_V`).
- **Cache từng bước** (`ctx.step`): sửa chữ chuyển động thì không tạo lại ảnh khung.

Cổng "Nối tiếp" thay cho trường `link: "chain"` cũ. Cảnh có dây Nối tiếp là cảnh nối, không có là cảnh cắt. Luật "không nối quá `MAX_CHAIN_RUN`" và "nối phải cùng chủ thể" vẫn áp dụng.

### 5.4 Biên kịch → Tạo thẻ cảnh

Biên kịch vẫn chạy như bây giờ (Muse chữ, tự sửa tối đa 3 lần). Khi chạy xong, thẻ Biên kịch hiện nút **Tạo thẻ cảnh**. Bấm vào là thao tác ở phía giao diện, không gọi Muse:
- Tạo một nhóm "Phân cảnh" chứa N node Cảnh xếp lưới, theo thứ tự.
- Nối sẵn Nhân vật, Bối cảnh, Đồ vật vào từng cảnh, và nối dây Nối tiếp cho các cảnh `chain`.
- Tạo một node Ghép phim, nối các clip theo đúng thứ tự.
- Bấm lại lần nữa thì hỏi: thay nhóm cũ hay tạo nhóm mới.

**Tự tạo lại thẻ cảnh**. Chủ dự án chọn 28/10/2026: "Tự tạo lại". Mục đích là giữ cách làm "gõ ý tưởng → bấm một nút → ra phim" như bây giờ.
- Khi Biên kịch ra kết quả mới trong một lần chạy, nhóm Phân cảnh mà Biên kịch đó tạo ra được tạo lại theo kết quả mới. Việc này nằm ngay trong lần chạy, không bắt bấm "Tạo thẻ cảnh".
  - Ví dụ: sửa ý tưởng rồi bấm Chạy cả workflow.
  - Các cảnh không đổi chữ vẫn trúng cache, không tốn lượt.
- Nếu đã sửa tay thẻ cảnh trong nhóm đó (chữ, dây, thêm hoặc xoá cảnh) kể từ lần tạo trước, thì **dừng trước khi gọi Muse cho các cảnh** và hỏi chủ dự án: thay bằng bộ cảnh mới, hay giữ bản đã sửa.
  - Thay: bỏ bản sửa tay.
  - Giữ: dùng các thẻ hiện có, kết quả mới của Biên kịch chỉ được lưu lại.
- Nhóm Phân cảnh ghi lại nó được tạo từ Biên kịch nào và từ kết quả nào (khoá cache), để biết có cần tạo lại không và có bị sửa tay không. Nhóm tạo tay, hoặc nhóm đã tách khỏi Biên kịch, thì không bao giờ bị thay.
- Cách hỏi giữa lúc chạy (dừng lần chạy chờ trả lời, hay hỏi ngay ở hộp xác nhận trước khi chạy dựa trên ước tính) là việc của builder. Yêu cầu duy nhất: không gửi Muse cảnh nào trước khi chủ dự án trả lời.

## 6. Thay đổi phía máy chủ (bộ máy chạy)

### 6.1 Chạy song song theo node

`executeRun()` hiện chạy từng node một theo thứ tự. Đổi thành: node nào đã đủ đầu vào thì được chạy. Số node chạy cùng lúc bị giới hạn theo dịch vụ: Muse bằng số hồ sơ rảnh (`provider.maxParallel()`), node chỉ dùng ffmpeg chạy được ngay. Thứ tự kết quả và cache không được phụ thuộc vào node nào chạy xong trước.

### 6.2 Cổng nhận nhiều dây

`PortDef` thêm `multiple?: boolean` (kèm cả `optional` như hiện nay). Áp cho Ghép phim.Clip, Dòng thời gian, và mọi cổng vào kiểu Chữ.
- `planGraph()` cho phép nhiều dây vào cổng `multiple`.
- Node nhận một **danh sách** giá trị, theo thứ tự lưu trong tham số của node nhận, ví dụ `order: string[]` là mã các node nguồn.
- Thiếu thứ tự thì xếp theo toạ độ trên canvas (trái sang phải, trên xuống dưới).
- Khoá cache của node nhận gồm cả thứ tự này.
- Ở khung bên phải của Ghép phim, thứ tự hiện thành dải ảnh nhỏ, kéo thả để đổi.

### 6.3 Chạy một phần

`POST /api/workflows/:id/runs` nhận thêm `{ mode: "all" | "node" | "downstream", nodeId? }`:
- `node`: chạy node đó, kèm các node phía trước còn thiếu kết quả. Các node phía trước đã có cache thì dùng lại.
- `downstream`: chạy node đó và mọi node phía sau nó.
- Node không thuộc phạm vi chạy thì không bị đổi trạng thái hay kết quả hiển thị. Giao diện vẫn hiện kết quả cũ của chúng (gộp kết quả lần chạy mới với lần trước theo từng node).

### 6.4 Lịch sử kết quả từng node ("lần tạo")

- Node tạo nội dung (Cảnh, Nhân vật, Bối cảnh, Đồ vật, Biên kịch, Tạo video…) có tham số `take` (mặc định 1) nằm trong khoá cache.
- "Chạy lại (bản mới)" tăng `take` thêm 1: khoá cache đổi nên ra một bản mới, còn bản cũ vẫn nằm trong cache.
- Chọn lại bản cũ là đặt `take` về số của bản đó: trúng cache, không tốn lượt.
- Cần một API liệt kê các bản đã có của một node, kèm ảnh hoặc video đại diện để dựng dải "‹ 2/3 ›" trên thẻ.
- Node phía sau luôn dùng bản đang chọn.
- Ghi chú cho builder: với khoá cache theo `take`, bước con (`ctx.step`) cũng phải có `take` trong khoá, nếu không thì "bản mới" sẽ lấy lại ảnh khung cũ.

### 6.5 Ước tính lượt trước khi chạy

- API ước tính cho một yêu cầu chạy (cùng tham số `mode`/`nodeId`): trả từng node là "dùng lại" hay "sẽ gọi dịch vụ", kèm số ảnh / video / chữ Muse dự kiến.
- Mỗi định nghĩa node có hàm ước tính dựa trên tham số và đầu vào. Ví dụ, Cảnh không người không đồ vật thì 0 ảnh + 1 video. Cảnh nối thì 0 ảnh + 1 video.
- Ước tính tính ở mức node và có thể thấp hơn thực tế khi bước con có cache. Thà ước dư còn hơn ước thiếu.
- Bấm Chạy cả workflow, hoặc chạy một lần có hơn 0 lượt Muse, thì luôn hiện hộp xác nhận kèm bảng ước tính. Chạy một node mà 0 lượt thì không cần hỏi.

### 6.6 Hàng chờ và huỷ

- Thông báo tiến độ của node ghi rõ đang làm bước nào, trên hồ sơ Muse nào. Giao diện có ô hàng chờ ở góc dưới bên trái.
- Thêm huỷ lượt chạy: `POST /api/runs/:id/cancel`. Việc Muse đang làm dở thì để xong hoặc bỏ, không gửi thêm việc mới. Trả nợ N-005 trong `DEBT.md`.

### 6.7 Workflow: danh sách, đổi tên, xoá, nhân bản

Thêm `DELETE /api/workflows/:id` (đợt 2, có hỏi xác nhận) và nhân bản. Đổi tên thì dùng `PUT` đã có trường `name`.

## 7. Chuyển workflow cũ — không được tốn lượt Muse

Workflow có node `shotlist` / `film` cũ, khi mở ra:
- Được chuyển một lần sang Cảnh × N + Ghép phim, dây nối tương ứng, giữ toàn bộ chữ của từng cảnh.
- Hiện thẳng ảnh khung và clip đã có từ kết quả `film` cũ (storyboard có `keyframeId`, `clipId`).
- **Bấm Chạy ngay sau khi chuyển phải ra 0 lượt Muse** cho các cảnh đã có clip, và ra phim giống hệt phim cũ.
  - Cách làm là việc của builder, ví dụ ghi sẵn cache của node Cảnh mới từ kết quả bước con cũ.
  - Phải có test chứng minh với dịch vụ giả: chuyển xong chạy thì số lần gọi dịch vụ bằng 0.
- Kiểu dữ liệu cũ vẫn đọc được: cảnh có trường `action`, xem `upgradeLegacyShot()`.
- **Workflow kiểu "Ý tưởng → phim"** (Biên kịch nối thẳng Dựng phim, không có node Danh sách cảnh): chữ của từng cảnh lấy từ kết quả Biên kịch **trong chính lần chạy đã tạo ra phim mới nhất**. Kết quả này nằm ở bảng `run_nodes` của lần chạy đó, nhờ vậy khớp đúng với phim. Lần chạy đó không còn kết quả Biên kịch, hoặc chưa từng chạy, thì chỉ chuyển Biên kịch + Ghép phim rỗng, không tạo thẻ cảnh. Không có kết quả cũ nào để mất trong trường hợp này.
- Bản gốc trước khi chuyển được giữ lại (ví dụ một workflow sao lưu, hoặc một cột trong db) để quay lại được nếu chuyển lỗi.

## 8. Giao diện

Bố cục và hành vi theo bản phác `canvas-v1.html`.

### 8.1 Bố cục

- **Thanh trên**:
  - Tên workflow (bấm để đổi tên) và các tab workflow đang mở.
  - Hoàn tác, làm lại.
  - Số tài khoản Muse sẵn sàng.
  - Ô "Lần chạy tới: X ảnh + Y video Muse" (lấy từ API ước tính, cập nhật khi sửa).
  - Nút ▶ Chạy cả workflow.
- **Thanh trái** (biểu tượng): Thêm node (mở ô tìm), Kho, Mẫu, Lịch sử các lần chạy, Ghi chú dán, Nhóm, Phím tắt, Cài đặt.
- **Canvas**: nền lưới chấm. Góc dưới phải có minimap (bản đồ thu nhỏ) và các nút phóng to, thu nhỏ, vừa màn hình. Góc dưới trái là ô hàng chờ.
- **Khung bên phải (Inspector)**: mở khi chọn một node. Có các tab Thông số / Kết quả (các bản) / Prompt gửi Muse (chỉ đọc). Có nút chạy node, ghi số lượt dự kiến. Bỏ chọn thì khung đóng.

### 8.2 Thẻ node

- Nhãn nhỏ phía trên thẻ gồm biểu tượng, tên và trạng thái (Chưa chạy / Đang chạy / Xong / Dùng lại / Lỗi). Kéo nhãn để di chuyển node.
- Thân thẻ là ảnh hoặc video, hoặc khối chữ ngắn. **Thẻ không có ô nhập nào.** Ngoại lệ duy nhất là Văn bản / Prompt: nháy đúp vào để sửa chữ ngay trên thẻ.
- Chân thẻ dài một dòng: một dòng mô tả, dải "‹ 2/3 ›" nếu có nhiều bản, thời lượng.
- Rê chuột vào thẻ: hiện nút ▶ chạy riêng node và tên các cổng.
- Đang chạy: viền vàng và thanh tiến độ. Lỗi: viền đỏ, kèm một dòng lỗi ngắn; lỗi đầy đủ xem ở khung phải.
- Thu nhỏ màn hình quá mức thì chỉ hiện ảnh và tên node, để đỡ nặng máy.
- Nhóm: khung nét đứt có tiêu đề, kéo tiêu đề thì cả nhóm đi theo.
  - Dây từ ngoài vào nhiều node trong cùng nhóm được **vẽ gộp thành một dây tới mép nhóm**, để không phải hiện 36 dây. Dữ liệu vẫn là từng dây riêng.
  - Nhóm Phân cảnh có tóm tắt kiểm luật đạo diễn.

### 8.3 Thêm và nối node

- **Ô tìm node**: mở bằng phím `/`, phím Space, nút + ở thanh trái, hoặc chuột phải vào chỗ trống. Chia nhóm Gần đây, Cơ bản, Nguồn & kho, Tham chiếu, Tạo ảnh, Tạo video, Chữ & AI, Xử lý video, Âm thanh, Tiện ích, Mẫu. Tìm theo chữ, Enter để chọn.
- **Kéo dây từ cổng ra chỗ trống**: mở ô tìm ngay tại chỗ thả, chỉ liệt kê node có cổng hợp loại. Chọn xong thì node được đặt ở chỗ thả và nối dây sẵn.
- Thả dây lên cổng sai loại: báo lý do (đã có từ PR #6). Cổng vào đã có dây và không phải cổng `multiple`: dây mới thay dây cũ.
- Bấm vào một dây để chọn, Delete để xoá. Chế độ cắt dây (kéo một đường cắt qua các dây) để sang đợt 2.

### 8.4 Menu chuột phải

- Trên node: Chạy node này · Chạy từ đây trở đi · Chạy lại (bản mới) · Lịch sử kết quả · Kéo dài video (chỉ node ra Video) · Lấy khung cuối → cảnh mới · Nhân bản · Nhân bản kèm dây · Nhóm · Khoá vị trí · Tải file kết quả · Lưu làm mẫu · Xoá.
- Trên chỗ trống: Thêm node ở đây · Dán · Vừa màn hình · Tự xếp gọn · Ghi chú dán ở đây.
- Lệnh nào chưa làm trong đợt hiện tại thì ẩn đi, không để lệnh chết.

### 8.5 Phím tắt

| Phím | Việc |
|---|---|
| `/`, Space | ô tìm node |
| Ctrl+Enter | chạy cả workflow (có hộp xác nhận) |
| Shift+Enter | chạy node đang chọn |
| Delete | xoá |
| Ctrl+D | nhân bản |
| Ctrl+C / Ctrl+V | sao chép / dán |
| Ctrl+Z / Ctrl+Shift+Z | hoàn tác / làm lại |
| Ctrl+G | nhóm |
| F | vừa màn hình |
| H | lịch sử kết quả của node đang chọn |
| ← → | xem bản trước / sau |
| ? | bảng phím tắt |

Phím tắt không chạy khi đang gõ trong ô nhập.

### 8.6 Bảng tính năng và đợt

"Đã có" là có sau PR #6.

| Tính năng | Đợt |
|---|---|
| Thẻ ảnh/video, nhãn trên thẻ, thẻ không có form | 1 |
| Khung bên phải sửa thông số | 1 |
| Mỗi cảnh một node, Ghép phim nhận nhiều dây, Biên kịch → Tạo thẻ cảnh | 1 |
| Chuyển workflow cũ, không tốn lượt | 1 |
| Nhóm, dây gộp vào mép nhóm | 1 |
| Ô tìm node, thả dây ra chỗ trống → node hợp loại nối sẵn | 1 |
| Menu chuột phải (các lệnh chạy, nhân bản, xoá, nhóm) | 1 |
| Chạy một node / từ đây trở đi | 1 |
| Ước tính lượt + hộp xác nhận | 1 |
| Ô hàng chờ, huỷ lượt chạy | 1 |
| Minimap, phóng to thu nhỏ, vừa màn hình | 1 |
| Màu cổng/dây, báo lý do nối sai, hiện lại kết quả cũ | đã có |
| Chạy lại (bản mới) — tham số `take` | 1 |
| Xem và chọn lại bản cũ của từng node | 2 |
| Hoàn tác / làm lại, copy/paste node, phím tắt đầy đủ | 2 |
| Tải ảnh/video lên, Từ kho (kéo thả), Lấy khung hình, Kéo dài video | 2 |
| Ghi chú dán, Xuất file | 2 |
| Lưu làm mẫu, nhân bản workflow, tab workflow, đổi tên, xoá workflow | 2 |
| Video khung đầu–cuối (thử Muse trước), Cắt video, Dòng thời gian, Chỉnh màu đồng bộ | 3 |
| Nhạc nền, lồng tiếng, trộn tiếng | 3 |
| So sánh 2 bản, Danh sách → chạy hàng loạt | 3 |

Mỗi đợt có kế hoạch riêng (`superpowers:writing-plans`), nhánh riêng, PR riêng. Đợt 1 chỉ coi là xong khi:
- Mở workflow Sơn La thì thấy 12 thẻ cảnh có ảnh.
- Chạy lại thì 0 lượt Muse, ra phim giống hệt.
- Sửa chuyển động một cảnh rồi chạy thì chỉ cảnh đó và các cảnh nối ngay sau nó gọi Muse, phim được ghép lại. Ở Sơn La: sửa cảnh 3 thì ra 1 video, sửa cảnh 5 thì ra 2 video (cảnh 5 và cảnh 6).
- "Chạy lại (bản mới)" một cảnh không đổi chữ thì ra 1 video mới (cộng thêm cảnh nối sau nó nếu có).
- Không còn node nào trên canvas có ô nhập trong thân thẻ.

## 9. Kiểm chứng

- **Unit test**:
  - `planGraph` với cổng nhiều dây và thứ tự.
  - Chạy song song: kết quả không phụ thuộc thứ tự xong.
  - Khoá chat nhân vật: không có hai ảnh khung chạy cùng lúc trong một chat.
  - Cầu dao tính chung cả lần chạy.
  - Chạy một phần (`node`, `downstream`).
  - `take` cùng cache bước con.
  - Ước tính lượt.
  - Chuyển workflow cũ: 0 lần gọi dịch vụ, phim giống hệt.
- **E2E** (dịch vụ giả, `data-testid` ghi trong `FEATURE_MAP.md`):
  - Thêm node bằng ô tìm và bằng thả dây.
  - Chọn node thì khung phải mở.
  - Chạy một cảnh.
  - Hộp xác nhận ghi đúng số lượt.
  - Biên kịch → Tạo thẻ cảnh → Chạy → ra phim.
  - Mở workflow cũ.
  - Menu chuột phải.
  - Phím tắt.
- **Hiệu năng**: workflow 30 node (2 nhóm 12 cảnh) kéo, phóng to vẫn mượt trên máy chủ dự án. Builder tự chọn cách đo, ghi kết quả trong PR.
- **Muse thật** (cuối đợt 1, ghi vào `TASKS.md`):
  - Chạy lại Sơn La sau khi chuyển: phải ra 0 lượt.
  - Sửa một cảnh rồi chạy: ra đúng 1 video và phim mới.

## 10. Để builder tự quyết

- Cách vẽ dây gộp vào mép nhóm. Nhóm là node `group` của React Flow hay một lớp vẽ riêng.
- Cách lưu nhóm trong `WorkflowGraph` (thêm trường `groups` hay node loại `group`). Yêu cầu duy nhất: workflow cũ không có trường này vẫn mở được.
- Cấu trúc file giao diện mới trong `src/features/editor/ui/`, và cách tách thẻ node cho từng loại (theo khuôn `src/nodes/<ten>/view.tsx`).
- Cách ghi sẵn cache khi chuyển workflow cũ, miễn là thoả mục 7.
- Dạng cụ thể của API ước tính, API danh sách bản, API huỷ.
- Kích thước, khoảng cách, phông chữ, biểu tượng (dùng ký tự Unicode như bản phác, hoặc SVG tự vẽ; không thêm thư viện biểu tượng lớn).
- Đoạn nào của Node Banana hoặc Tersa đáng chép (ghi `NOTICE.md`).

## 11. Rủi ro

- Nâng bộ máy chạy (song song, nhiều dây, chạy một phần) đụng phần lõi đã có test. Phải giữ toàn bộ test cũ xanh, và thêm test cho từng thay đổi trước khi đổi giao diện.
- Chuyển workflow cũ mà lỗi thì mất kết quả hoặc tốn lượt. Có bản sao lưu và test 0 lượt.
- Đợt 1 lớn. Nếu phải chia nhỏ thì làm phần máy chủ trước (6.1–6.3, mục 7), có test, rồi mới đến giao diện.
