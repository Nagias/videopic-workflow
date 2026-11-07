// Cầu dao dịch vụ: số lần dịch vụ báo lỗi máy chủ (MUSE_FAILED), hết giờ chờ không trả kết quả (NO_MEDIA) hoặc trả clip
// tự dựng bằng code thay cho video AI (NOT_AI_VIDEO) trong một lần chạy thì dừng gửi thêm việc, và các mã lỗi được đếm.
// Nơi duy nhất giữ hai giá trị này.
export const SERVICE_FAILURE_LIMIT = 3;
export const SERVICE_FAILURE_CODES: ReadonlySet<string> = new Set(["MUSE_FAILED", "NO_MEDIA", "NOT_AI_VIDEO"]);
