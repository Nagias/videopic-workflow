import { describe, expect, it } from "vitest";
import { inheritProvider, placeNewNode } from "./new-node";

const at = (x: number, y: number, params: Record<string, unknown> = {}) => ({ position: { x, y }, data: { params } });

describe("thêm node mới", () => {
  it("đặt giữa vùng đang nhìn; trùng chỗ thì lùi chéo cho khỏi đè", () => {
    expect(placeNewNode({ x: 1000, y: 500 }, [])).toEqual({ x: 840, y: 380 });
    expect(placeNewNode({ x: 1000, y: 500 }, [at(840, 380), at(880, 420)])).toEqual({ x: 920, y: 460 });
  });

  it("dùng cùng dịch vụ với node đang có; không có thì giữ mặc định; node không có dịch vụ thì không thêm", () => {
    expect(inheritProvider({ provider: "fake", name: "" }, [at(0, 0, { text: "x" }), at(0, 0, { provider: "muse" })])).toEqual({ provider: "muse", name: "" });
    expect(inheritProvider({ provider: "fake" }, [at(0, 0, { provider: "la" })])).toEqual({ provider: "fake" });
    expect(inheritProvider({ text: "" }, [at(0, 0, { provider: "muse" })])).toEqual({ text: "" });
  });
});
