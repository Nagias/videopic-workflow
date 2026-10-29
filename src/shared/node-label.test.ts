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

  it("nhóm tay (Ctrl+G) chỉ là khung nhìn: thành viên giữ tên cũ, không thành 'Prompt 1'", () => {
    const manual = { nodes: [], edges: [], groups: [{ id: "manual-1", label: "Nhóm 1", nodeIds: ["p1", "p2"], manual: true }] };
    expect(labelOf({ id: "p1", params: {} }, "Prompt", manual)).toBe("Prompt");
    expect(labelOf({ id: "p2", params: {} }, "Prompt", manual)).toBe("Prompt");
    expect(labelOf({ id: "c", params: { name: "Mai" } }, "Hồ sơ nhân vật", { groups: [{ id: "m", label: "Nhóm", nodeIds: ["c"], manual: true }] })).toBe("Hồ sơ nhân vật: Mai");
  });

  it("cảnh nằm cả trong nhóm Phân cảnh lẫn nhóm tay (nhóm tay đứng trước) vẫn đánh số theo nhóm Phân cảnh", () => {
    const both = {
      groups: [
        { id: "manual-1", label: "Nhóm 1", nodeIds: ["c", "a"], manual: true },
        { id: "g1", label: "Phân cảnh", nodeIds: ["a", "b", "c"] },
      ],
    };
    expect(labelOf({ id: "c", params: {} }, "Cảnh", both)).toBe("Cảnh 3");
    expect(labelOf({ id: "a", params: {} }, "Cảnh", both)).toBe("Cảnh 1");
  });
});
