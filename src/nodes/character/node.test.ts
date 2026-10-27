import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { CHARACTER_VIEWS, definition } from "./definition";
import { run } from "./run";

describe("node character (Hồ sơ nhân vật)", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it("tạo 3 ảnh: chính diện trước, 2 ảnh sau đính kèm ảnh chính diện; chạy lại cùng ngữ cảnh không tạo lại", async () => {
    const counter = countingFakeProviders();
    const ctx = testNodeCtx(env, counter.providers);
    const params = { description: "an adult Vietnamese woman in her early 20s, plain features", provider: "fake" as const };
    const out = await run(ctx, {}, params);
    expect(out.character?.kind === "imageset" && out.character.images.length).toBe(3);
    expect(counter.log.image).toBe(3);
    await run(ctx, {}, params);
    expect(counter.log.image).toBe(3);
    expect(CHARACTER_VIEWS("x")[1]!.prompt).toContain("same woman as in the attached photo");
  });

  it("mô tả quá ngắn bị chặn", () => {
    expect(definition.params.safeParse({ description: "cô gái", provider: "fake" }).success).toBe(false);
  });
});
