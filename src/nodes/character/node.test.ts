import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { definition } from "./definition";
import { run } from "./run";

describe("node character (Hồ sơ nhân vật)", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it("tạo 4 ảnh: mặt cận mở chat phụ mới, 3 ảnh toàn thân nối tiếp trong chat đó; chạy lại cùng ngữ cảnh không tạo lại", async () => {
    const counter = countingFakeProviders();
    const ctx = testNodeCtx(env, counter.providers);
    const params = { description: "an adult Vietnamese woman in her early 20s, plain features", provider: "fake" as const };
    const out = await run(ctx, {}, params);
    expect(out.character?.kind === "imageset" && out.character.images.map((i) => i.view)).toEqual(["face", "front", "side", "back"]);
    expect(counter.log.image).toBe(4);
    expect(counter.log.imageSessions).toEqual(["new", "continue", "continue", "continue"]);
    expect(counter.log.imagePrompts[1]).toMatch(/chính người trong ảnh bạn vừa tạo ở trên/);
    expect(counter.log.imagePrompts.every((p) => !/cinematic|photorealistic/i.test(p))).toBe(true);
    expect(out.character?.kind === "imageset" && out.character.session?.threadUrl).toMatch(/^fake:\/\/thread\//);
    await run(ctx, {}, params);
    expect(counter.log.image).toBe(4);
  });

  it("mô tả quá ngắn bị chặn", () => {
    expect(definition.params.safeParse({ description: "cô gái", provider: "fake" }).success).toBe(false);
  });
});
