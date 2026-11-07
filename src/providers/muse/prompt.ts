import type { ClipDuration } from "../../shared/providers";

const ROLE_CAPTION: Record<string, string> = {
  character: "hồ sơ nhân vật — giữ đúng gương mặt, kiểu tóc, vóc dáng và trang phục",
  location: "hồ sơ bối cảnh — giữ đúng lều, dòng suối, cây cối, địa hình và ánh sáng",
  previous: "khung hình ngay trước — nối tiếp hành động, giữ bố cục",
};

// Đo 06–07/11/2026: công cụ tạo video của Muse báo lỗi nội bộ, Muse không báo lỗi nữa mà tự dựng clip bằng code (cắt nhân vật
// thành hình rời, vá nền, cho trượt) — 35/36 cảnh phim hoạt hình là hình cắt ghép. Câu này đi kèm mọi yêu cầu video.
export function videoToolRule(hasInputImage: boolean): string {
  return [
    `Bắt buộc dùng công cụ tạo video AI của bạn để tạo clip này${hasInputImage ? " từ ảnh đính kèm" : ""}.`,
    "Không tự dựng video bằng code: không cắt nhân vật hay đồ vật thành hình rời rồi cho trượt trên nền, không dịch chuyển hay phóng to ảnh tĩnh, không vẽ từng khung rồi ghép thành video.",
    "Gửi nguyên file do công cụ tạo video trả về, không cắt, không ghép, không nén lại.",
    "Nếu công cụ tạo video báo lỗi thì chỉ trả lời là bị lỗi, không làm cách khác.",
  ].join(" ");
}

export function formatVideoPrompt(prompt: string, durationSec: ClipDuration, hasInputImage = false): string {
  const action = prompt.trim();
  if (!action) throw new Error("Prompt đang trống");
  const tags = [
    `[Duration: ${durationSec}s]`,
    hasInputImage
      ? "[Mode: Image-to-Video] Dùng đúng ảnh đính kèm làm khung hình gốc, giữ nguyên bố cục, gương mặt và trang phục nhân vật, không cắt cảnh"
      : "[Mode: Text-to-Video Motion Generation]",
    `Action: ${action}`,
    "Pacing: chuyển động tự nhiên như quay vlog bằng điện thoại",
    "16:9 landscape",
  ];
  return `tạo cho tôi 1 video ${durationSec}s: ${tags.join(", ")}`;
}

export function formatImagePrompt(prompt: string, roles: string[]): string {
  const scene = prompt.trim();
  if (!scene) throw new Error("Prompt đang trống");
  const captions = roles.map((r, i) => `ảnh ${i + 1}: ${ROLE_CAPTION[r] ?? r}`);
  const refs = captions.length ? `Ảnh đính kèm — ${captions.join("; ")}. ` : "";
  return `tạo cho tôi 1 hình ảnh 2K tỉ lệ 16:9, ảnh chụp chân thực: ${refs}${scene}. 16:9 widescreen, no text, no watermark`;
}
