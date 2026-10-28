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
