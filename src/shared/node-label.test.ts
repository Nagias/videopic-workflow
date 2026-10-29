import { describe, expect, it } from "vitest";
import { labelOf } from "./node-label";

const graph = { nodes: [], edges: [], groups: [{ id: "g1", label: "Phân cảnh", nodeIds: ["a", "b", "c"] }] };

describe("labelOf — tên node cho người đọc", () => {
  it("Cảnh trong nhóm theo số thứ tự", () => {
    expect(labelOf({ id: "c", params: {} }, "Cảnh", graph)).toBe("Cảnh 3");
    expect(labelOf({ id: "a", params: {} }, "Cảnh", graph)).toBe("Cảnh 1");
  });

  it("node ngoài nhóm có tên thì kèm tên, không tên thì nhãn loại node", () => {
    expect(labelOf({ id: "x", params: { name: "  Mai " } }, "Hồ sơ nhân vật", graph)).toBe("Hồ sơ nhân vật: Mai");
    expect(labelOf({ id: "x", params: { name: "   " } }, "Hồ sơ nhân vật", graph)).toBe("Hồ sơ nhân vật");
    expect(labelOf({ id: "x", params: null }, "Prompt", graph)).toBe("Prompt");
  });

  it("đồ thị chưa có nhóm vẫn đặt tên được", () => {
    expect(labelOf({ id: "a", params: {} }, "Cảnh", {})).toBe("Cảnh");
  });
});
