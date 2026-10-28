# Soi giao diện Higgsfield Canvas và Magnific Spaces (28/10/2026)

Cách soi: mở trang bằng trình duyệt, không đăng nhập, đọc mã giao diện (JS) mà trang đã tải về. Không gọi API riêng tư, không vượt đăng nhập. Canvas thật của cả hai trang đều cần đăng nhập nên chưa xem được node trên màn hình thật (trừ canvas minh hoạ ở trang giới thiệu Magnific).

## 1. Higgsfield Canvas

Nguồn: `https://higgsfield.ai/canvas`, gói mã trình sửa `@higgsfield/canvas` (file `01bd19df-T9uKU4owerUuPAGX.js`).

**Ít loại node, cổng tự sinh theo model.** Chỉ có các loại node chung:
- `text` / `prompt`: chữ. Cổng vào kiểu chữ nhận không giới hạn số dây.
- `stickyNote`, `shape`: ghi chú, hình vẽ trang trí, không chạy.
- `generate`: MỘT loại node tạo cho mọi model. Chọn model nào thì cổng vào/ra đổi theo model đó (`ports` tính từ `generation_type`). Cổng có thể có: `prompt`, `input_image(s)`, `start_image`, `end_image`, `image_references`, `video_references`, `audio_references`, `input_videos`, `input_audio`.
- `media`: ảnh / video / âm thanh tải lên hoặc lấy từ kho (`mediaType`).
- `file`.
- `llm` / `llm_text` (nhóm "utility"): node AI viết chữ, có `system_prompt`, `user_prompt`, chọn model chữ, mức suy nghĩ (`off/low/medium/high`).
- `text2speech`, đổi giọng, lồng tiếng khớp môi (`dubbing_lipsync`), dịch.
- `subcanvas`: canvas con lồng trong canvas (gom nhóm thành khối).

**Thông số trên node tạo**: `aspectRatio`, `duration`, `resolution`, `batchSize` (tạo nhiều bản một lần), `seed`, `enhance_prompt`, `negative_prompt`, `generate_audio`, `extensionMode` (`forward`/`backward`: kéo dài video về sau hoặc về trước), ánh sáng (`brightness`, `diffuse`, `color`), thể loại / thời đại / nhịp / bảng màu (`genreId`, `eraId`, `pacingId`, `colorPalette`).

**Prompt có "nhắc tên" tài sản**: chuỗi `<<<…>>>` trong prompt là chỗ gắn nhân vật/đồ vật (giống `@element-name` trong tài liệu Higgsfield).

**Thao tác khác thấy trong mã**: chạy từng node (`run_canvas_node`), tạo/sửa/xoá node, gửi ảnh từ thư viện vào canvas (`send_to_canvas`), xem toàn màn hình (`set_full_view_canvas`), sao chép/dán node qua clipboard riêng, nhân bản canvas, mẫu canvas (`canvas/templates`, có mẫu "Long Video Example", "Extend Video", "Simple Seedance 2.0"), chia sẻ, nhắc tên người trong bình luận, chế độ xem bộ ảnh của một lần chạy (`jobSet`).

## 2. Magnific Spaces

Nguồn: `https://www.magnific.com/spaces` và trình sửa `https://www.magnific.com/app/spaces/…` (mã tải từ `cdn.magnific.com`, 245 file). Danh sách dưới lấy từ khoá chữ giao diện `spaces.*` trong mã.

**Hình dáng node (canvas minh hoạ ở trang giới thiệu)**: không có khung form. Phía trên thẻ là nhãn nhỏ kèm biểu tượng ("Input", "Note", "Instructions", "Image Result"). Thân thẻ chính là ảnh hoặc khối chữ. Cổng là chấm tròn có biểu tượng loại dữ liệu, dây mang màu theo loại. Theo tài liệu Magnific: Video màu xanh lá, Âm thanh màu cam.

**Node cơ bản (FAQ trang giới thiệu)**: Upload, Text (prompt, ghi chú, bình luận), Assistant (AI viết/biến đổi prompt), Image Generator, Video Generator, Image Upscaler.

**Toàn bộ 69 loại node trong mã** (`spaces.workflow.elements.*`):
applyMask, audio, autoResize, background, changeCameraAngle, cleanSpeech, colorMatch, comfyui, composer, composition, depthAnything3, depthMap, evaluator, export, flow, frames, framesToVideo, game, image, imageAdjust, imageCrop, imageExpander, imageGenerator, imageMaskEdit, imageTo360, imageTo3D, imageUpscaler, list, move, music, page, patina, process3DModel, promptGenerator, references, relight, removeBackground, retexture3DModel, rigOrAnimate3DModel, router, sfxGenerator, sketch, skinEnhancer, soundtrack, speak, speechToSpeech, speechToText, status, svg, swapAnything, switcher, text, textTo3DPreview, textTo3DRefine, threeDScene, variations, video, videoAudioMix, videoColorGrading, videoCombiner, videoEditing, videoExtend, videoFrameSplitter, videoGenerator, videoModify, videoReshoot, videoTimeline, videoUpscaler, voiceOver.

Các node liên quan trực tiếp đến video dài của dự án này: `videoGenerator` (cổng `firstFrame`, `lastFrame`, `prompt`, tuỳ chọn có tiếng), `videoExtend`, `videoCombiner` (ghép nhiều video, báo lỗi khi thiếu video), `videoTimeline`, `videoFrameSplitter` (tách video thành khung/cảnh: lấy tất cả, lấy mẫu, chọn tay, theo cảnh quay; tách tiếng hoặc clip), `framesToVideo`, `videoAudioMix`, `voiceOver`, `music`, `soundtrack`, `references` (node tài sản tham chiếu: nhân vật, bối cảnh), `list` (danh sách → chạy hàng loạt), `variations` (nhiều góc / nhiều kiểu người), `evaluator` (AI chấm kết quả), `router` / `switcher` (rẽ nhánh), `changeCameraAngle`, `relight`.

**Menu chuột phải (36 lệnh)**: run, runAll, runDownstream (chạy node này và các node phía sau), runSingular, reRun, recreate, reimagine, duplicate, delete, rename, edit, copyPrompt, download, focus, group / ungroup, lock / unlock, arrangeGrid / arrangeMoodboard / arrangeWorkflow (tự xếp gọn), animate, convertToVideo, createVideoExtend, upscale, removeBackground, imageEdit, soundEffects, setAsPoster, openPreview, viewDetails, viewGenerationHistory, exportAsTemplate, publishAsShortcut, exportPromptGeneratorResult.

**Phím tắt (30)**: undo/redo, copy/cut/paste (kèm hoặc không kèm dây), duplicate (kèm hoặc không kèm dây), delete, selectAll, clearSelection, zoom vừa tất cả / vừa vùng chọn / về 100%, mở Spotlight, xem nhanh phần tử (quicklook trước/sau), so sánh vùng chọn, bật/tắt lịch sử, bật/tắt thông tin, chế độ con trỏ / kéo màn hình / sticker / ghi chú, chế độ cắt dây, chạy cả workflow / chạy một node, thêm mốc khi tách khung video. Trong mã có `Shift+Slash` (mở bảng phím tắt).

**Spotlight (ô tìm để thêm node)**: nhóm theo Cơ bản, Ảnh, Video, Âm thanh, Chữ, LLM, Tham chiếu, Tiện ích, Nguồn media, Mẫu, Ứng dụng, Gần đây; các mục Nhân vật, Bối cảnh, Phong cách, Bảng màu, Kho, Lịch sử, Yêu thích, Trong space này, Model. Có ghim mục hay dùng, mục gần đây. Kéo dây từ cổng ra chỗ trống cũng mở Spotlight, chỉ hiện node cắm được (tài liệu Magnific).

**Cài đặt canvas**: tự focus node mới, tự mở khung Inspector (khung bên phải) khi chọn, đường gióng khi kéo, số bản tạo hiện trong danh sách, chế độ nhẹ máy, chú thích chi tiết, ẩn/hiện dây, video tự phát, tiếng video, hiện tên node khi thu nhỏ.

**Khác**: Inspector (khung bên phải sửa thông số), bình luận gắn vào canvas (mở/đã xong), chia sẻ xem/sửa, cộng tác thời gian thực, nhóm (panel) lồng nhau có giới hạn, Workflow App (đóng gói workflow thành 1 khối có đầu vào/đầu ra, chọn kiểu ô nhập: chữ tự do, số, chọn một, danh sách), thông số "nhà quay phim" (máy quay, ống kính, tiêu cự, khẩu độ, phim, ánh sáng, cỡ cảnh), báo lỗi nối dây có lý do (model không nhận ảnh, quá số dây, thiếu prompt…), hỏi xác nhận trước khi chạy hàng loạt tốn nhiều credit (`fanOutCreditsConfirm`), báo thiếu dữ liệu phía trước trước khi chạy (`missingUpstreamData`).

## 3. ComfyUI (mã nguồn mở, tài liệu chính thức docs.comfy.org)

Thanh trái: Assets (xem lại, dùng lại, tải, xoá media đã tạo), Node Library (lưới cơ bản, danh sách đủ, đánh dấu, tìm), Model Library, Workflows, Apps, Job History. Thanh trên: các workflow đang mở (dạng tab), nút Run kèm số lần chạy (batch), chế độ chạy (Run / Run khi có thay đổi / Run ngay), huỷ lượt chạy, số việc đang chờ. Khung phải: Parameters / Info / Settings / Errors (lỗi kèm nút "tìm node trên canvas"). Canvas: minimap, ẩn/hiện dây, vừa màn hình, Focus Mode, Subgraph (gom nhóm thành node con), chạy một phần workflow, cổng vào tự mọc thêm khi nối, chế độ App (giao diện tuyến tính cho người chỉ cần bấm chạy).

## 4. Mã nguồn mở bắt chước các trang này (tìm 28/10/2026, đã kiểm repo)

| Dự án | Giấy phép | Nền | Đáng lấy |
|---|---|---|---|
| [Node Banana](https://github.com/shrimbly/node-banana) | MIT, 1.654 sao, cập nhật 26/10/2026 | Next 16, React 19, @xyflow/react 12.11.2, Zustand, Tailwind 4 | Giống Weavy/Flora nhất. Node: Prompt, Image/Video/Audio Input, Generate Image/Video/Audio, LLM, VideoStitch (ghép), VideoTrim, VideoFrameGrab (lấy khung), SplitGrid, ImageCompare, OutputGallery, Router/Switch, Array (hàng loạt). Có `ConnectionDropMenu` (thả dây ra chỗ trống), `NodeSearchMenu`, xem lại các lần tạo (carousel), minimap, nhóm, undo/redo, phím tắt |
| [Tersa](https://github.com/vercel-labs/tersa) | MIT | Next 16, React 19, @xyflow/react 12.10, shadcn, cmdk | Khuôn thẻ node gọn, dễ đọc; thả dây ra chỗ trống mở bảng chọn node |
| [BeatDesign](https://github.com/BeatAPI/BeatDesign) | Apache-2.0 | Vite, React 19, @xyflow/react 12.11, Drizzle + SQLite, Playwright | Gần như trùng bộ công nghệ dự án; thanh prompt chung kiểu Higgsfield, timeline, xuất MP4 |
| [InvokeAI](https://github.com/invoke-ai/InvokeAI) | Apache-2.0 | React 19 + @xyflow/react 12 | Cách kiểm kiểu cổng |
| [ComfyUI_frontend](https://github.com/Comfy-Org/ComfyUI_frontend) | GPL-3.0 | Vue 3 | Chỉ học ý tưởng, khác framework |

## 5. Rút ra cho VideoPic (đề xuất, chưa duyệt)

- Node là thẻ ảnh/video; thông số sửa ở khung bên phải (Inspector).
- Một node "Tạo" chọn model/kiểu (ảnh, video từ chữ, video từ khung đầu–cuối), cổng tự đổi theo kiểu, thay cho nhiều loại node cứng.
- Node nguồn: Ảnh tải lên, Kho (nhân vật, bối cảnh, đồ vật đã tạo).
- Spotlight: phím `/` hoặc Space, kéo dây ra chỗ trống → chỉ hiện node cắm được.
- Menu chuột phải: chạy / chạy từ đây trở đi / chạy lại / lịch sử kết quả / kéo dài video / nhân bản / nhóm / xuất mẫu.
- Node video dài: Tách khung (lấy khung cuối), Kéo dài video, Ghép video, Dòng thời gian.
- Hỏi xác nhận số lượt Muse trước khi chạy nhiều node.
