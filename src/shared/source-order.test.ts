import { describe, expect, it } from "vitest";
import { orderAfterMove, orderSourceList, shiftTarget } from "./source-order";

const at = (positions: Record<string, { x: number; y: number }>) => (id: string) => positions[id];
const src = (...ids: string[]) => ids.map((source) => ({ source, sourceHandle: "clip" }));

describe("orderSourceList — thứ tự dây vào của cổng nhiều dây", () => {
  it("theo order trước, phần còn lại theo toạ độ x rồi y", () => {
    const pos = at({ a: { x: 300, y: 0 }, b: { x: 100, y: 50 }, c: { x: 100, y: 10 }, d: { x: 0, y: 0 } });
    expect(orderSourceList(src("a", "b", "c", "d"), ["a"], pos).map((s) => s.source)).toEqual(["a", "d", "c", "b"]);
  });

  it("không có order thì chỉ theo toạ độ; order hỏng (không phải mảng chữ) bị bỏ qua", () => {
    const pos = at({ a: { x: 5, y: 0 }, b: { x: 1, y: 0 } });
    expect(orderSourceList(src("a", "b"), undefined, pos).map((s) => s.source)).toEqual(["b", "a"]);
    expect(orderSourceList(src("a", "b"), "xấu", pos).map((s) => s.source)).toEqual(["b", "a"]);
    expect(orderSourceList(src("a", "b"), [1, null, "a"], pos).map((s) => s.source)).toEqual(["a", "b"]);
  });

  it("mã trong order mà không còn nối vào thì bỏ qua; không đổi mảng đầu vào", () => {
    const input = src("a", "b");
    const out = orderSourceList(input, ["x", "b", "a"], at({}));
    expect(out.map((s) => s.source)).toEqual(["b", "a"]);
    expect(input.map((s) => s.source)).toEqual(["a", "b"]);
  });
});

describe("orderAfterMove — ghi order sau khi kéo", () => {
  it("kéo clip cuối lên đầu", () => {
    expect(orderAfterMove(undefined, ["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });

  it("kéo xuống: chỉ số đích tính theo danh sách sau khi đã bỏ clip đang kéo ra", () => {
    expect(orderAfterMove(undefined, ["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("chỉ số ngoài khoảng thì kẹp vào hai đầu; mã không có trong danh sách thì giữ nguyên thứ tự", () => {
    expect(orderAfterMove(undefined, ["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
    expect(orderAfterMove(undefined, ["a", "b", "c"], "c", -5)).toEqual(["c", "a", "b"]);
    expect(orderAfterMove(undefined, ["a", "b"], "zzz", 0)).toEqual(["a", "b"]);
  });

  it("mã đã lưu mà không còn nối vào được giữ lại ở cuối, không chen vào thứ tự các clip đang nối", () => {
    expect(orderAfterMove(["old", "a", "b"], ["a", "b"], "b", 0)).toEqual(["b", "a", "old"]);
  });
});

describe("shiftTarget — chỉ số đích của phím Alt+mũi tên", () => {
  it("lên/xuống một bước, đứng yên ở hai đầu", () => {
    expect(shiftTarget(2, -1, 4)).toBe(1);
    expect(shiftTarget(2, 1, 4)).toBe(3);
    expect(shiftTarget(0, -1, 4)).toBe(0);
    expect(shiftTarget(3, 1, 4)).toBe(3);
  });
});
