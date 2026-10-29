// Cầu dao dịch vụ: số lần dịch vụ báo lỗi máy chủ trong một lần chạy thì dừng gửi thêm việc,
// và các mã lỗi được đếm. Nơi duy nhất giữ hai giá trị này.
export const SERVICE_FAILURE_LIMIT = 3;
export const SERVICE_FAILURE_CODES: ReadonlySet<string> = new Set(["MUSE_FAILED", "NO_MEDIA"]);
