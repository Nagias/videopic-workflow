import { describe, expect, it } from "vitest";
import type { PreflightCtx, PreflightNode } from "./node-definition";
import { styleMismatch } from "./style-check";

function ctx(character: { type: string; params: unknown } | undefined, location: { type: string; params: unknown } | undefined): PreflightCtx {
  const node = (id: string, type: string, params: unknown): PreflightNode => ({
    node: { id, type, position: { x: 0, y: 0 }, params: {} },
    params,
    inputs: new Map(),
  });
  const planned = new Map<string, PreflightNode>();
  if (character) planned.set("c", node("c", character.type, character.params));
  if (location) planned.set("l", node("l", location.type, location.params));
  const scene = node("s", "scene", {});
  planned.set("s", scene);
  return {
    node: scene,
    graph: { nodes: [], edges: [] },
    planned,
    sources: (_id, port) =>
      port === "character" && character
        ? [{ source: "c", sourceHandle: "character" }]
        : port === "location" && location
          ? [{ source: "l", sourceHandle: "location" }]
          : [],
  };
}

describe("khoá cùng phong cách phim", () => {
  it("Dàn nhân vật hoạt hình + Không gian người thật → lỗi trước khi chạy; cùng phong cách thì qua", () => {
    const cast = { type: "cast", params: { style: "hoat-hinh-2d" } };
    expect(styleMismatch(ctx(cast, { type: "location", params: {} })).join()).toMatch(/Hoạt hình 2D.*Người thật/);
    expect(styleMismatch(ctx(cast, { type: "location", params: { style: "hoat-hinh-2d" } }))).toEqual([]);
    expect(styleMismatch(ctx(cast, { type: "location", params: { style: "hoat-hinh-3d" } }))).toHaveLength(1);
  });

  it("Hồ sơ nhân vật (người thật) + Không gian hoạt hình → lỗi; người thật + người thật hoặc thiếu một bên → qua", () => {
    const real = { type: "character", params: {} };
    expect(styleMismatch(ctx(real, { type: "location", params: { style: "hoat-hinh-3d" } }))).toHaveLength(1);
    expect(styleMismatch(ctx(real, { type: "location", params: {} }))).toEqual([]);
    expect(styleMismatch(ctx(real, undefined))).toEqual([]);
  });
});
