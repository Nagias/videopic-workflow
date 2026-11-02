import { PROVIDERS } from "./providers";

// Công cụ nhỏ cho dòng chân thẻ node (cardLine() trong các definition.ts): số giây kiểu Việt, chữ rút gọn, tên dịch vụ.

// 59.8 → "59,8 giây"; số nguyên bỏ phần lẻ: 5 → "5 giây".
export function fmtSec(sec: number): string {
  const rounded = Math.round(sec * 10) / 10;
  return `${String(rounded).replace(".", ",")} giây`;
}

// Gộp xuống dòng và khoảng trắng, cắt còn tối đa `max` ký tự (thêm "…" khi bị cắt).
export function shorten(text: unknown, max: number): string {
  if (typeof text !== "string") return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…` : flat;
}

// Tên dịch vụ hiển thị; mã lạ (workflow cũ) giữ nguyên mã.
export function providerName(id: unknown): string {
  if (typeof id !== "string" || id === "") return "chưa chọn dịch vụ";
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}
