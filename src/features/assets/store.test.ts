import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { listAssets, recordAsset } from "./store";

describe("kho tài sản", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it("cùng tham số nhưng khoá khác (prompt trong code đổi) → thay mục cũ, không hiện hai mục trùng", () => {
    const params = { name: "Cô gái", description: "cô gái áo đen", provider: "fake" };
    const outputs = { character: { kind: "imageset" as const, role: "character" as const, description: "x", images: [{ mediaId: "m1", view: "face" }] } };
    recordAsset(env.db, { cacheKey: "k-cu", kind: "character", params, outputs });
    recordAsset(env.db, { cacheKey: "k-moi", kind: "character", params, outputs });
    recordAsset(env.db, { cacheKey: "k-khac", kind: "character", params: { ...params, description: "người khác" }, outputs });
    expect(listAssets(env.db, "character").map((a) => a.id).sort()).toEqual(["k-khac", "k-moi"]);
  });
});

describe("kho tài sản — ảnh thật của Đồ vật", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it("lưu kho Đồ vật giữ photos của từng món", () => {
    const params = { items: [{ name: "Bàn gấp", description: "bàn dã ngoại gấp gọn", states: "gấp phẳng, trong túi", photos: { "gấp phẳng": ["m1", "m2"] } }], provider: "fake" };
    const outputs = {
      props: {
        kind: "props" as const,
        items: [{ name: "Bàn gấp", description: "bàn dã ngoại gấp gọn", images: [{ mediaId: "m1", state: "gấp phẳng" }, { mediaId: "m2", state: "gấp phẳng" }, { mediaId: "m3", state: "trong túi" }] }],
      },
    };
    recordAsset(env.db, { cacheKey: "k1", kind: "props", params, outputs });
    const [asset] = listAssets(env.db, "props");
    expect(asset?.params.items).toEqual([{ name: "Bàn gấp", description: "bàn dã ngoại gấp gọn", states: "gấp phẳng, trong túi", photos: { "gấp phẳng": ["m1", "m2"] } }]);
  });
});
