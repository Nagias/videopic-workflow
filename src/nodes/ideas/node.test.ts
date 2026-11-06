import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testCastSet } from "../../../tests/helpers/cartoon";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { definition } from "./definition";
import { run } from "./run";

describe("node ideas (Ý tưởng tập phim)", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const base = { hint: "dịp sinh nhật", pick: 1, own: "", provider: "fake" as const };

  it("hỏi một lượt ra 3 ý tưởng, ra ý tưởng đã chọn; đổi lựa chọn thì không hỏi lại", async () => {
    const counter = countingFakeProviders();
    const ctx = testNodeCtx(env, counter.providers);
    const inputs = { character: testCastSet() };
    const first = await run(ctx, inputs, base);
    expect(counter.log.text).toBe(1);
    expect(counter.log.textPrompts[0]).toMatch(/Gợi ý của chủ kênh cho tập này: dịp sinh nhật/);
    expect(counter.log.textPrompts[0]).toMatch(/Gián luôn tìm cách cướp đồ ăn/);
    expect(first.idea?.kind === "text" && first.idea.text).toMatch(/^Ý tưởng giả 1:/);
    expect(first.options?.kind === "text" && first.options.text.split("\n")).toHaveLength(3);
    const third = await run(ctx, inputs, { ...base, pick: 3 });
    expect(third.idea?.kind === "text" && third.idea.text).toMatch(/^Ý tưởng giả 3:/);
    expect(counter.log.text).toBe(1);
  });

  it("ý tưởng riêng: dùng luôn, không gọi dịch vụ, ước tính 0 lượt", async () => {
    const counter = countingFakeProviders();
    const out = await run(testNodeCtx(env, counter.providers), {}, { ...base, own: "Gián giành điều khiển TV của Mướp" });
    expect(out.idea).toEqual({ kind: "text", text: "Gián giành điều khiển TV của Mướp" });
    expect(counter.log.text).toBe(0);
    expect(definition.estimate?.({ ...base, own: "x" }, new Set())).toEqual({ image: 0, video: 0, text: 0 });
  });

  it("nối Hồ sơ nhân vật người thật (không có dàn) → lỗi rõ", async () => {
    const counter = countingFakeProviders();
    const real = { kind: "imageset" as const, role: "character" as const, description: "cô gái", images: [] };
    await expect(run(testNodeCtx(env, counter.providers), { character: real }, base)).rejects.toThrow(/Dàn nhân vật/);
  });
});
