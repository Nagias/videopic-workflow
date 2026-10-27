# FEATURE_MAP — bản đồ tính năng VideoPic Workflow

Tra file này **trước** khi làm, tái hiện lỗi hay kiểm chứng bất kỳ tính năng nào (`CLAUDE.md` mục 2.3). Không đoán đường: tính năng cần tìm không có ở đây thì tìm trong code rồi bổ sung vào file này trong cùng nhánh.

Quy ước ghi:
- Phần tử giao diện ghi bằng `data-testid` (ví dụ `[data-testid=run-button]`); e2e và người kiểm chứng đều bấm theo đúng tên này.
- Endpoint ghi "phương thức + đường dẫn" đúng như trong `src/features/*/routes.ts`. Test `tests/architecture.test.ts` kiểm mọi endpoint trong code đều có mặt ở đây.
- Hàm ghi kèm `()`, không ghi số dòng.
- Cột "Tốn": **Muse** (tài khoản Muse thật, mất lượt), **ffmpeg** (CPU), **—** (không tốn gì).

---

## 0. Điều kiện ban đầu

| Cần có | Để làm gì | Kiểm tra | Thiếu thì sao |
|---|---|---|---|
| Node ≥ 24, `npm ci` | chạy app, test | `npm run verify` | không chạy được |
| ffmpeg/ffprobe trong PATH | dịch vụ giả tạo clip, kiểm clip Muse | `ffmpeg -version` | node Tạo video báo "Không chạy được ffmpeg" |
| Google Chrome đã cài | Muse provider điều khiển Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` | Muse không chạy được |
| Hồ sơ Muse đã đăng nhập `.data/chrome_profiles/muse_vid_0N` | tạo video bằng Muse | `npm run smoke:muse` | node báo "Chưa có tài khoản Muse nào đã đăng nhập" |

## 1. Luồng 1 — Bộ khung đi được: Prompt → Tạo video → xem clip

(Điền khi xong Task 8 của `docs/superpowers/plans/2026-10-27-khung-di-duoc.md`.)
