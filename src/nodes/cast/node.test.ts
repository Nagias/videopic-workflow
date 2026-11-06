import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { definition, type CastParams } from "./definition";
import { run } from "./run";

const CAST_PARAMS: CastParams = {
  name: "Mướp và lũ gián",
  style: "hoat-hinh-2d",
  members: [
    { name: "Mướp", look: "mèo mướp cam béo tròn, mắt xanh lá, vòng cổ đỏ có chuông vàng", size: "cao 40 cm", trait: "lười, tham ăn" },
    { name: "gián Đỏ", look: "gián nâu đứng hai chân, đội mũ lưỡi trai đỏ", size: "cao 7 cm, chỉ tới đầu gối Mướp", trait: "lanh lợi, cầm đầu" },
  ],
  rules: "Ba con gián luôn tìm cách cướp đồ ăn của Mướp.",
  provider: "fake",
};

describe("node cast (Dàn nhân vật)", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it("ảnh cả dàn đúng tỉ lệ mở chat mới, từng nhân vật nối tiếp trong chat; ra bộ ảnh có phong cách, dàn, luật", async () => {
    const counter = countingFakeProviders();
    const ctx = testNodeCtx(env, counter.providers);
    const out = await run(ctx, {}, CAST_PARAMS);
    const set = out.character;
    expect(set?.kind === "imageset" && set.images.map((i) => i.view)).toEqual(["front", "member-1", "member-2"]);
    expect(set?.kind === "imageset" && set.style).toBe("hoat-hinh-2d");
    expect(set?.kind === "imageset" && set.members?.map((m) => m.name)).toEqual(["Mướp", "gián Đỏ"]);
    expect(set?.kind === "imageset" && set.rules).toMatch(/cướp đồ ăn/);
    expect(counter.log.imageSessions).toEqual(["new", "continue", "continue"]);
    expect(counter.log.imagePrompts[0]).toMatch(/đúng tỉ lệ kích thước/);
    expect(counter.log.imagePrompts[0]).toMatch(/gián Đỏ cao 7 cm/);
    // Phong cách hoạt hình, không dính câu chữ người thật.
    expect(counter.log.imagePrompts.every((p) => /hoạt hình 2D/.test(p) && !/Ảnh chụp bằng điện thoại|lỗ chân lông/.test(p))).toBe(true);
    expect(definition.estimate?.(CAST_PARAMS, new Set())).toEqual({ image: 3, video: 0, text: 0 });
  });

  it("chặn dàn rỗng, trùng tên, thiếu kích thước", () => {
    expect(definition.params.safeParse({ ...CAST_PARAMS, members: [] }).success).toBe(false);
    expect(definition.params.safeParse({ ...CAST_PARAMS, members: [CAST_PARAMS.members[0], { ...CAST_PARAMS.members[1], name: "mướp" }] }).success).toBe(false);
    expect(definition.params.safeParse({ ...CAST_PARAMS, members: [{ ...CAST_PARAMS.members[0], size: "" }] }).success).toBe(false);
  });
});
