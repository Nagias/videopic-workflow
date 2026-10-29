import { describe, expect, it } from "vitest";
import { actionFor, SHORTCUTS, type KeyInfo } from "./shortcuts";

const key = (k: string, mods: Partial<KeyInfo> = {}): KeyInfo => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe("actionFor — bảng phím tắt", () => {
  it("/ → ô tìm node", () => expect(actionFor(key("/"), false)).toBe("spotlight"));
  it("Space → ô tìm node", () => expect(actionFor(key(" "), false)).toBe("spotlight"));
  it("Ctrl+Enter → chạy cả workflow (Cmd+Enter cũng vậy)", () => {
    expect(actionFor(key("Enter", { ctrlKey: true }), false)).toBe("run-all");
    expect(actionFor(key("Enter", { metaKey: true }), false)).toBe("run-all");
  });
  it("Shift+Enter → chạy node đang chọn", () => expect(actionFor(key("Enter", { shiftKey: true }), false)).toBe("run-selected"));
  it("Enter trơn không phải phím tắt", () => expect(actionFor(key("Enter"), false)).toBeNull());
  it("Ctrl+D → nhân bản (hoa thường đều được)", () => {
    expect(actionFor(key("d", { ctrlKey: true }), false)).toBe("duplicate");
    expect(actionFor(key("D", { ctrlKey: true }), false)).toBe("duplicate");
  });
  it("Ctrl+G → nhóm", () => expect(actionFor(key("g", { ctrlKey: true }), false)).toBe("group"));
  it("Ctrl+Shift+G không phải phím nhóm", () => expect(actionFor(key("G", { ctrlKey: true, shiftKey: true }), false)).toBeNull());
  it("F → vừa màn hình; Ctrl+F (tìm trong trang của trình duyệt) không bị giành", () => {
    expect(actionFor(key("f"), false)).toBe("fit");
    expect(actionFor(key("f", { ctrlKey: true }), false)).toBeNull();
  });
  it("? → bảng phím tắt", () => expect(actionFor(key("?", { shiftKey: true }), false)).toBe("help"));
  it("Delete và Backspace → xoá", () => {
    expect(actionFor(key("Delete"), false)).toBe("delete");
    expect(actionFor(key("Backspace"), false)).toBe("delete");
  });
  it("Esc → bỏ chọn / đóng", () => expect(actionFor(key("Escape"), false)).toBe("escape"));

  it("đang gõ thì / không mở ô tìm", () => {
    expect(actionFor(key("/"), true)).toBeNull();
    expect(actionFor(key(" "), true)).toBeNull();
  });
  it("đang gõ thì mọi phím tắt im, chỉ Esc còn tác dụng", () => {
    for (const k of [key("Enter", { ctrlKey: true }), key("Enter", { shiftKey: true }), key("d", { ctrlKey: true }), key("g", { ctrlKey: true }), key("f"), key("?"), key("Delete"), key("Backspace")]) {
      expect(actionFor(k, true), k.key).toBeNull();
    }
    expect(actionFor(key("Escape"), true)).toBe("escape");
  });

  it("Space và Enter trên nút / liên kết bấm được thì để nút tự xử lý", () => {
    expect(actionFor(key(" "), false, true)).toBeNull();
    expect(actionFor(key("Enter", { shiftKey: true }), false, true)).toBeNull();
    expect(actionFor(key("/"), false, true)).toBe("spotlight");
  });

  it("tiêu điểm trong khung bên phải / ô hàng chờ (vd trên một nút ở đó): Delete và Backspace không xoá node; phím khác vẫn chạy", () => {
    expect(actionFor(key("Delete"), false, true, true)).toBeNull();
    expect(actionFor(key("Backspace"), false, false, true)).toBeNull();
    expect(actionFor(key("Escape"), false, true, true)).toBe("escape");
    expect(actionFor(key("f"), false, false, true)).toBe("fit");
    // Ngoài khung: Delete trên canvas vẫn xoá.
    expect(actionFor(key("Delete"), false, false, false)).toBe("delete");
  });

  it("Ctrl/Alt đi kèm / hoặc Space thì không phải phím tắt", () => {
    expect(actionFor(key("/", { ctrlKey: true }), false)).toBeNull();
    expect(actionFor(key(" ", { altKey: true }), false)).toBeNull();
  });
});

describe("SHORTCUTS — cùng một bảng cho phím và bảng phím tắt", () => {
  it("mỗi hành động có đúng một dòng, có phím hiển thị và mô tả tiếng Việt", () => {
    const actions = SHORTCUTS.map((s) => s.action);
    expect(new Set(actions).size).toBe(actions.length);
    expect([...actions].sort()).toEqual(["delete", "duplicate", "escape", "fit", "group", "help", "run-all", "run-selected", "spotlight"]);
    for (const s of SHORTCUTS) {
      expect(s.keys.length, s.action).toBeGreaterThan(0);
      expect(s.label.length, s.action).toBeGreaterThan(3);
    }
  });
});
