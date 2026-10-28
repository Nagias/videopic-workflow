# Ghi nguồn mã nguồn mở

Dự án học phương pháp và viết lại prompt (không chép nguyên file) từ các dự án dưới đây. Chủ dự án chỉ dùng cá nhân (CLAUDE.md mục 1).

## ViMax — MIT License
https://github.com/HKUDS/ViMax — Copyright (c) HKUDS.
Dùng ở `src/shared/prompts.ts` (`writerPrompt`, `keyframePrompt`, `motionPrompt`): tách cảnh thành khung đầu là ảnh đứng yên / chuyển động chỉ là việc xảy ra sau đó; cảnh đầu là cảnh rộng nhất; gọi nhân vật bằng đặc điểm nhìn thấy; nêu vị trí và hướng mặt.

## Toonflow — MIT License
https://github.com/HBAI-Ltd/Toonflow-app — Copyright (c) 2026 HBAI-Ltd.
Dùng ở `src/shared/prompts.ts` (`CHARACTER_SHEET`, `LOCATION_SHEET`, `propStillPrompt`, `propStatePrompt`) và node `props`: bộ ảnh mẫu nhân vật (mặt cận + toàn thân chính diện/nghiêng/sau), đồ vật chụp tĩnh vật có mặt đỡ và bóng, không tay người, trạng thái đồ vật tạo từ ảnh gốc, tông ảnh chốt một lần dùng cho mọi cảnh.

Văn bản giấy phép MIT: "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND."

## Huobao Drama — CC BY-NC-SA 4.0
https://github.com/chatfire-AI/huobao-drama — chỉ học ý tưởng (Biên kịch tự lọc danh sách đồ vật để tạo ảnh mẫu), không chép mã hay chữ.
