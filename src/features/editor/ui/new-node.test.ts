import { describe, expect, it } from "vitest";
import { cardWidthOf, inheritProvider, placeNewNode } from "./new-node";

const at = (x: number, y: number, params: Record<string, unknown> = {}) => ({ position: { x, y }, data: { params } });

describe("thêm node mới", () => {
  it("đặt giữa vùng đang nhìn; trùng chỗ thì lùi chéo cho khỏi đè", () => {
    expect(placeNewNode({ x: 1000, y: 500 }, [], "character")).toEqual({ x: 875, y: 380 });
    expect(placeNewNode({ x: 1000, y: 500 }, [at(875, 380), at(915, 420)], "character")).toEqual({ x: 955, y: 460 });
  });

  it("tâm thẻ đúng tâm vùng nhìn theo bề rộng thật của từng loại thẻ", () => {
    expect([cardWidthOf("prompt"), cardWidthOf("scene"), cardWidthOf("film-combine"), cardWidthOf("loai-la")]).toEqual([250, 210, 340, 250]);
    for (const type of ["prompt", "scene", "film-combine"]) {
      expect(placeNewNode({ x: 1000, y: 500 }, [], type).x + cardWidthOf(type) / 2).toBe(1000);
    }
    expect(placeNewNode({ x: 1000, y: 500 }, [])).toEqual({ x: 875, y: 380 });
  });

  it("dùng cùng dịch vụ với node đang có; không có thì giữ mặc định; node không có dịch vụ thì không thêm", () => {
    expect(inheritProvider({ provider: "fake", name: "" }, [at(0, 0, { text: "x" }), at(0, 0, { provider: "muse" })])).toEqual({ provider: "muse", name: "" });
    expect(inheritProvider({ provider: "fake" }, [at(0, 0, { provider: "la" })])).toEqual({ provider: "fake" });
    expect(inheritProvider({ text: "" }, [at(0, 0, { provider: "muse" })])).toEqual({ text: "" });
  });
});
