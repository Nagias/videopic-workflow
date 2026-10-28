import type { ClipDuration } from "../../shared/providers";

const ROLE_CAPTION: Record<string, string> = {
  character: "hồ sơ nhân vật — giữ đúng gương mặt, kiểu tóc, vóc dáng và trang phục",
  location: "hồ sơ bối cảnh — giữ đúng lều, dòng suối, cây cối, địa hình và ánh sáng",
  previous: "khung hình ngay trước — nối tiếp hành động, giữ bố cục",
};

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
