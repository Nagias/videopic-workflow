import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { LOCATION_VIEWS } from "./definition";
import { run } from "./run";

describe("node location (Hồ sơ không gian)", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it("tạo 2 ảnh không người: toàn cảnh rồi cận (đính kèm toàn cảnh)", async () => {
    const counter = countingFakeProviders();
    const out = await run(testNodeCtx(env, counter.providers), {}, { description: "a hillside in Son La with a tent above a stream", provider: "fake" });
    const set = out.location;
    expect(set?.kind === "imageset" && set.images.map((i) => i.view)).toEqual(["wide", "close"]);
    expect(LOCATION_VIEWS("x").every((v) => v.prompt.includes("no people"))).toBe(true);
  });
});
