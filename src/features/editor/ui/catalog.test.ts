import { describe, expect, it } from "vitest";
import type { AssetSummary } from "../../../shared/api";
import { catalogItems, CATEGORIES, filterByPort, portFor, recentFrom, recentItems, rememberRecent, searchItems, visibleCategories } from "./catalog";

const types = (items: { nodeType?: string }[]) => items.flatMap((i) => (i.nodeType ? [i.nodeType] : []));

const asset = (id: string, kind: AssetSummary["kind"], name: string): AssetSummary => ({ id, kind, name, params: { name, description: `${name} mô tả dài hơn hai mươi ký tự`, provider: "fake" }, thumbnailMediaId: null, updatedAt: 1 });

describe("ô tìm node: danh mục", () => {
  it("không có film/shotlist (node ẩn)", () => {
    const t = types(catalogItems());
    expect(t).not.toContain("film");
    expect(t).not.toContain("shotlist");
    expect(t).toContain("scene");
    expect(t).toContain("prompt");
  });

  it("mỗi node hiện đúng một lần, mỗi mẫu một mục, key không trùng", () => {
    const items = catalogItems();
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(items.filter((i) => i.template).map((i) => i.template)).toEqual(["sinh-ton-son-la", "y-tuong-thanh-phim"]);
    expect(items.every((i) => i.tag === "have" && i.label.length > 0 && i.icon.length > 0)).toBe(true);
  });

  it("mục kho tạo node cùng loại với mục kho và mang tham số của mục kho", () => {
    const items = catalogItems([asset("a1", "character", "Mai"), asset("a2", "props", "Rìu và gỗ")]);
    const a = items.find((i) => i.asset?.id === "a1")!;
    expect(a.nodeType).toBe("character");
    expect(a.category).toBe("nguon-kho");
    expect(a.label).toBe("Mai");
    expect(a.asset?.params.name).toBe("Mai");
    expect(items.find((i) => i.asset?.id === "a2")?.nodeType).toBe("props");
  });

  it("nhóm theo bản phác, nhóm không có mục thì ẩn", () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual(["Gần đây", "Cơ bản", "Nguồn & kho", "Tham chiếu", "Tạo video", "Chữ & AI", "Xử lý video", "Mẫu"]);
    const items = catalogItems();
    const shown = visibleCategories(items, 0).map((c) => c.id);
    expect(shown).toEqual(["co-ban", "tham-chieu", "tao-video", "chu-ai", "xu-ly-video", "mau"]);
    expect(visibleCategories(catalogItems([asset("a1", "character", "Mai")]), 0).map((c) => c.id)).toContain("nguon-kho");
    expect(visibleCategories(items, 2).map((c) => c.id)[0]).toBe("gan-day");
    // Kho tải lỗi: nhóm Nguồn & kho vẫn hiện (đúng chỗ thứ tự) để có chỗ báo lỗi.
    expect(visibleCategories(items, 0, ["nguon-kho"]).map((c) => c.id)).toEqual(["co-ban", "nguon-kho", "tham-chieu", "tao-video", "chu-ai", "xu-ly-video", "mau"]);
  });
});

describe("ô tìm node: lọc theo cổng", () => {
  it("lọc kind video dir out → có Cảnh (Nối tiếp), Ghép phim; không có Nhân vật", () => {
    const t = types(filterByPort(catalogItems(), { kind: "video", dir: "out" }));
    expect(t.sort()).toEqual(["film-combine", "scene"]);
    expect(portFor(catalogItems().find((i) => i.nodeType === "scene")!, { kind: "video", dir: "out" })?.name).toBe("follow");
    expect(portFor(catalogItems().find((i) => i.nodeType === "film-combine")!, { kind: "video", dir: "out" })?.name).toBe("clips");
  });

  it("lọc kind imageset dir in → có Nhân vật, Bối cảnh", () => {
    const t = types(filterByPort(catalogItems(), { kind: "imageset", dir: "in" }));
    expect(t).toContain("character");
    expect(t).toContain("location");
    expect(t).not.toContain("scene");
    expect(portFor(catalogItems().find((i) => i.nodeType === "character")!, { kind: "imageset", dir: "in" })?.name).toBe("character");
  });

  it("đang lọc thì mẫu bị loại; mục kho chỉ giữ khi node của nó có cổng hợp loại", () => {
    const items = catalogItems([asset("a1", "character", "Mai"), asset("a2", "props", "Rìu")]);
    const f = filterByPort(items, { kind: "imageset", dir: "in" });
    expect(f.some((i) => i.template)).toBe(false);
    expect(f.some((i) => i.asset?.id === "a1")).toBe(true);
    expect(f.some((i) => i.asset?.id === "a2")).toBe(false);
  });

  it("cổng đích là cổng trùng tên với cổng đang kéo: Bối cảnh → Cảnh / Biên kịch nối vào `location`, không phải `character`", () => {
    const items = catalogItems();
    const target = (type: string, filter: Parameters<typeof portFor>[1]) => portFor(items.find((i) => i.nodeType === type)!, filter)?.name;
    const fromLocation = { kind: "imageset", dir: "out", handle: "location" } as const;
    const fromCharacter = { kind: "imageset", dir: "out", handle: "character" } as const;
    expect(target("scene", fromLocation)).toBe("location");
    expect(target("writer", fromLocation)).toBe("location");
    expect(target("scene", fromCharacter)).toBe("character");
    expect(target("writer", fromCharacter)).toBe("character");
    // Cổng Clip (Video) không trùng tên cổng nào: vẫn lấy cổng đầu tiên cùng loại.
    expect(target("film-combine", { kind: "video", dir: "out", handle: "clip" })).toBe("clips");
    expect(target("scene", { kind: "video", dir: "out", handle: "clip" })).toBe("follow");
    // Kéo từ cổng vào: node có cổng ra trùng tên.
    expect(target("location", { kind: "imageset", dir: "in", handle: "location" })).toBe("location");
    expect(target("character", { kind: "imageset", dir: "in", handle: "character" })).toBe("character");
    // Không biết tên cổng: cổng đầu tiên cùng loại như trước.
    expect(target("scene", { kind: "imageset", dir: "out" })).toBe("character");
  });

  it("kéo từ cổng vào `location` của Cảnh: Hồ sơ không gian đứng đầu danh sách; từ `character`: Hồ sơ nhân vật", () => {
    const items = catalogItems();
    expect(types(filterByPort(items, { kind: "imageset", dir: "in", handle: "location" }))).toEqual(["location", "character"]);
    expect(types(filterByPort(items, { kind: "imageset", dir: "in", handle: "character" }))).toEqual(["character", "location"]);
    expect(types(filterByPort(items, { kind: "imageset", dir: "in" }))).toEqual(["character", "location"]);
  });

  it("kéo từ cổng vào chữ: node có cổng ra chữ (Prompt)", () => {
    expect(types(filterByPort(catalogItems(), { kind: "text", dir: "in" }))).toEqual(["prompt"]);
  });
});

describe("ô tìm node: tìm chữ", () => {
  it("gõ 'cảnh' → Cảnh đứng đầu; gõ không dấu 'canh' cũng ra", () => {
    const items = catalogItems();
    expect(searchItems(items, "cảnh")[0]?.nodeType).toBe("scene");
    expect(searchItems(items, "canh")[0]?.nodeType).toBe("scene");
  });

  it("tìm cả mô tả; không khớp thì rỗng; để trống thì giữ nguyên", () => {
    const items = catalogItems();
    expect(searchItems(items, "ghép").some((i) => i.nodeType === "film-combine")).toBe(true);
    expect(searchItems(items, "zzzzqq")).toEqual([]);
    expect(searchItems(items, "  ")).toEqual(items);
  });

  it("tìm được mục kho theo tên", () => {
    const items = catalogItems([asset("a1", "character", "Cô gái Sơn La")]);
    expect(searchItems(items, "co gai")[0]?.asset?.id).toBe("a1");
  });
});

describe("ô tìm node: gần đây", () => {
  it("mới nhất lên đầu, không trùng, tối đa 6", () => {
    let list: string[] = [];
    for (const k of ["a", "b", "c", "d", "e", "f", "g"]) list = rememberRecent(list, k);
    expect(list).toEqual(["g", "f", "e", "d", "c", "b"]);
    expect(rememberRecent(list, "d")).toEqual(["d", "g", "f", "e", "c", "b"]);
  });

  it("giá trị hỏng đọc ra danh sách rỗng, chỉ giữ chuỗi", () => {
    expect(recentFrom(null)).toEqual([]);
    expect(recentFrom({ a: 1 })).toEqual([]);
    expect(recentFrom(["a", 3, "b", null])).toEqual(["a", "b"]);
    expect(recentFrom(["1", "2", "3", "4", "5", "6", "7"])).toHaveLength(6);
  });

  it("mục gần đây theo thứ tự đã nhớ, bỏ khoá không còn trong danh mục", () => {
    const items = catalogItems();
    const got = recentItems(items, ["node-scene", "da-xoa", "node-prompt"]);
    expect(got.map((i) => i.key)).toEqual(["node-scene", "node-prompt"]);
  });
});
