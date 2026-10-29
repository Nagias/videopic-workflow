// Bảng phím tắt của canvas: MỘT bảng cho cả việc nhận phím (actionFor) lẫn bảng phím tắt hiện cho người dùng (ShortcutSheet),
// nên hai bên không thể lệch nhau. Hàm thuần: Editor chỉ việc hỏi actionFor rồi làm.

export type ShortcutAction = "spotlight" | "run-all" | "run-selected" | "duplicate" | "group" | "delete" | "fit" | "help" | "escape";

// Phần của KeyboardEvent mà bảng phím cần (để test truyền đối tượng thường).
export type KeyInfo = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

type Shortcut = {
  action: ShortcutAction;
  // Cách ghi phím hiện trong bảng phím tắt (mỗi phần tử một phím thay thế nhau).
  keys: string[];
  label: string;
  match(e: KeyInfo): boolean;
};

const ctrl = (e: KeyInfo) => e.ctrlKey || e.metaKey;
const plain = (e: KeyInfo) => !e.ctrlKey && !e.metaKey && !e.altKey;
const chord = (e: KeyInfo, letter: string) => ctrl(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === letter;

export const SHORTCUTS: readonly Shortcut[] = [
  { action: "spotlight", keys: ["/", "Space"], label: "Mở ô tìm node để thêm node", match: (e) => plain(e) && (e.key === "/" || e.key === " ") },
  { action: "run-all", keys: ["Ctrl+Enter"], label: "Chạy cả workflow", match: (e) => ctrl(e) && !e.shiftKey && !e.altKey && e.key === "Enter" },
  { action: "run-selected", keys: ["Shift+Enter"], label: "Chạy node đang chọn", match: (e) => e.shiftKey && !ctrl(e) && !e.altKey && e.key === "Enter" },
  { action: "duplicate", keys: ["Ctrl+D"], label: "Nhân bản node đang chọn (không kèm dây)", match: (e) => chord(e, "d") },
  { action: "group", keys: ["Ctrl+G"], label: "Gom các node đang chọn thành nhóm", match: (e) => chord(e, "g") },
  { action: "delete", keys: ["Delete", "Backspace"], label: "Xoá node và dây đang chọn", match: (e) => plain(e) && (e.key === "Delete" || e.key === "Backspace") },
  { action: "fit", keys: ["F"], label: "Vừa màn hình: thu phóng để thấy hết các node", match: (e) => plain(e) && e.key.toLowerCase() === "f" },
  { action: "help", keys: ["?"], label: "Mở bảng phím tắt này", match: (e) => plain(e) && e.key === "?" },
  { action: "escape", keys: ["Esc"], label: "Bỏ chọn, đóng menu hoặc bảng đang mở", match: (e) => e.key === "Escape" },
];

// Phím này làm việc gì? `typing`: đang gõ trong ô nhập (input, textarea, select, contenteditable) → chỉ Esc còn tác dụng.
// `onControl`: nút bấm được (button, a, summary) đang được chọn — nó tự xử lý Space và Enter, không giành lại.
export function actionFor(e: KeyInfo, typing: boolean, onControl = false): ShortcutAction | null {
  for (const s of SHORTCUTS) {
    if (!s.match(e)) continue;
    if (typing && s.action !== "escape") return null;
    if (onControl && (e.key === " " || e.key === "Enter")) return null;
    return s.action;
  }
  return null;
}
