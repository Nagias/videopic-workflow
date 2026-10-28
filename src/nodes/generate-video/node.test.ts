import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { definition } from "./definition";
import { run } from "./run";

describe("node generate-video", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it("mặc định dịch vụ thử, 5 giây; chỉ nhận 5 hoặc 10", () => {
    expect(definition.defaults).toEqual({ provider: "fake", durationSec: 5 });
    expect(definition.params.safeParse({ provider: "fake", durationSec: 10 }).success).toBe(true);
    expect(definition.params.safeParse({ provider: "fake", durationSec: 6 }).success).toBe(false);
    expect(definition.params.safeParse({ provider: "kling", durationSec: 5 }).success).toBe(false);
  });

  it("gọi provider và trả cổng video có thời lượng thật", async () => {
    const { providers, calls } = countingFakeProviders();
    const messages: string[] = [];
    const out = await run(
      testNodeCtx(env, providers, messages),
      { prompt: { kind: "text", text: "sản phẩm trên bàn gỗ" } },
      { provider: "fake", durationSec: 5 },
    );
    expect(out.video?.kind).toBe("video");
    expect(calls()).toBe(1);
    expect(messages[0]).toMatch(/Đang gửi/);
  });

  it("báo lỗi khi thiếu đầu vào prompt", async () => {
    const { providers } = countingFakeProviders();
    await expect(
      run(testNodeCtx(env, providers), {}, { provider: "fake", durationSec: 5 }),
    ).rejects.toThrow(/Thiếu đầu vào/);
  });
});
