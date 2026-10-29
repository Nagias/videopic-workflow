import { z } from "zod";
import { describe, expect, it } from "vitest";
import { webNodes } from "../../../nodes/registry.web";
import type { FlowNode } from "./GraphNode";
import { duplicateNode, nextTake, paramsHaveTake } from "./node-ops";

const node = (id: string, x: number, y: number, params: Record<string, unknown> = {}, selected = false): FlowNode => ({
  id,
  type: "prompt",
  position: { x, y },
  selected,
  data: { params },
});

describe("duplicateNode", () => {
  it("bản sao lệch 40px, mã mới, chép sâu tham số, là node duy nhất được chọn", () => {
    const nested = { text: "cô gái bên suối", list: [{ a: 1 }] };
    const nodes = [node("p1", 100, 50, nested, true), node("p2", 400, 50, {}, true)];
    const out = duplicateNode(nodes, "p1", "copy-1");
    expect(out).not.toBeNull();
    const copy = out!.find((n) => n.id === "copy-1")!;
    expect(copy.position).toEqual({ x: 140, y: 90 });
    expect(copy.type).toBe("prompt");
    expect(copy.data.params).toEqual(nested);
    expect(copy.data.params).not.toBe(nested);
    expect((copy.data.params as typeof nested).list).not.toBe(nested.list);
    expect(out!.filter((n) => n.selected).map((n) => n.id)).toEqual(["copy-1"]);
    expect(out).toHaveLength(3);
    // Node gốc không đổi ngoài việc bỏ chọn.
    expect(out!.find((n) => n.id === "p1")!.position).toEqual({ x: 100, y: 50 });
  });

  it("không có node thì trả null; khung nhóm không nhân bản được", () => {
    expect(duplicateNode([node("p1", 0, 0)], "khong-co", "x")).toBeNull();
    const frame: FlowNode = { id: "frame-g1", type: "group-frame", position: { x: 0, y: 0 }, data: { params: {} } };
    expect(duplicateNode([frame], "frame-g1", "x")).toBeNull();
  });
});

describe("take (lần tạo)", () => {
  it("nextTake: chưa có take → 2; có take n → n+1; giá trị hỏng coi như 1", () => {
    expect(nextTake({})).toBe(2);
    expect(nextTake({ take: 1 })).toBe(2);
    expect(nextTake({ take: 4 })).toBe(5);
    expect(nextTake({ take: "3" })).toBe(2);
    expect(nextTake({ take: 0 })).toBe(2);
    expect(nextTake({ take: 2.5 })).toBe(2);
  });

  it("paramsHaveTake đọc từ schema tham số: chỉ node Cảnh có take", () => {
    expect(paramsHaveTake(z.object({ take: z.number().optional(), a: z.string() }))).toBe(true);
    expect(paramsHaveTake(z.object({ a: z.string() }))).toBe(false);
    expect(paramsHaveTake(z.string())).toBe(false);
    const withTake = Object.entries(webNodes)
      .filter(([, impl]) => paramsHaveTake(impl.definition.params))
      .map(([type]) => type);
    expect(withTake).toEqual(["scene"]);
  });
});
