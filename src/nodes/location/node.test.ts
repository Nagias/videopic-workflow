import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { DEFAULT_LOOK } from "../../shared/prompts";
import { definition } from "./definition";
import { run } from "./run";

describe("node location (Hồ sơ không gian)", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it("tạo 2 ảnh không người trong cùng chat phụ, gắn câu tông ảnh (mặc định khi để trống) vào bộ ảnh", async () => {
    const counter = countingFakeProviders();
    const out = await run(testNodeCtx(env, counter.providers), {}, definition.params.parse({ description: "sườn đồi Sơn La có suối đá bên dưới", look: " ", provider: "fake" }));
    const set = out.location;
    expect(set?.kind === "imageset" && set.images.map((i) => i.view)).toEqual(["wide", "close"]);
    expect(set?.kind === "imageset" && set.look).toBe(DEFAULT_LOOK);
    expect(counter.log.imageSessions).toEqual(["new", "continue"]);
    expect(counter.log.imagePrompts.every((p) => p.includes("không có người"))).toBe(true);
  });

  it("tông ảnh tự gõ được dùng trong prompt và gắn vào bộ ảnh", async () => {
    const counter = countingFakeProviders();
    const look = "Ảnh điện thoại, nắng chiều vàng nhẹ";
    const out = await run(testNodeCtx(env, counter.providers), {}, definition.params.parse({ description: "sườn đồi Sơn La có suối đá bên dưới", look, provider: "fake" }));
    expect(out.location?.kind === "imageset" && out.location.look).toBe(look);
    expect(counter.log.imagePrompts[0]).toContain(look);
  });
});

describe("node location (Hồ sơ không gian) — ảnh thật", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const description = "mặt hồ rộng giữa núi, nước xanh phẳng lặng";
  const photo = async (colorHex: string): Promise<string> => {
    const out = await env.storage.tmpPath("jpg");
    await env.ffmpeg.makeTestImage({ out, colorHex, width: 400, height: 300 });
    return (await env.storage.importFile(out, { kind: "image", source: "upload", width: 400, height: 300 })).id;
  };

  it("có 1 ảnh thật → 0 lượt, bộ ảnh chỉ có góc wide là ảnh thật, giữ tông ảnh", async () => {
    const a = await photo("336699");
    const counter = countingFakeProviders();
    const out = await run(testNodeCtx(env, counter.providers), {}, definition.params.parse({ description, photos: [a], provider: "fake" }));
    expect(out.location).toEqual({ kind: "imageset", role: "location", description, images: [{ mediaId: a, view: "wide" }], look: DEFAULT_LOOK });
    expect(counter.log.image).toBe(0);
  });

  it("có 2 ảnh thật → wide + close", async () => {
    const [a, b] = [await photo("336699"), await photo("669933")];
    const out = await run(testNodeCtx(env, countingFakeProviders().providers), {}, definition.params.parse({ description, photos: [a, b], provider: "fake" }));
    expect(out.location?.kind === "imageset" && out.location.images).toEqual([
      { mediaId: a, view: "wide" },
      { mediaId: b, view: "close" },
    ]);
  });

  it("ước tính 0 ảnh khi có ảnh thật; không có ảnh thì như cũ (2)", () => {
    const none = new Set<string>();
    expect(definition.estimate?.(definition.params.parse({ description, photos: ["m1"], provider: "fake" }), none)).toEqual({ image: 0, video: 0, text: 0 });
    expect(definition.estimate?.(definition.params.parse({ description, provider: "fake" }), none)).toEqual({ image: 2, video: 0, text: 0 });
    expect(definition.estimate?.(definition.params.parse({ description, photos: [], provider: "fake" }), none)).toEqual({ image: 2, video: 0, text: 0 });
  });

  it("predict khi có ảnh thật = kết quả chạy; không ảnh thì không dự đoán", async () => {
    const a = await photo("336699");
    const params = definition.params.parse({ description, photos: [a], provider: "fake" });
    const ran = await run(testNodeCtx(env, countingFakeProviders().providers), {}, params);
    const known = { inputs: {}, step: () => undefined, media: (id: string) => env.storage.getMedia(id) };
    expect(definition.predict?.(params, new Set(), known)).toEqual(ran);
    expect(definition.predict?.(definition.params.parse({ description, provider: "fake" }), new Set(), known)).toBeUndefined();
  });

  it("3 ảnh → tham số bị từ chối", () => {
    expect(definition.params.safeParse({ description, photos: ["a", "b", "c"], provider: "fake" }).success).toBe(false);
  });
});
