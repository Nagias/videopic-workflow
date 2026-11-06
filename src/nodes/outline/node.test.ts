import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testCastSet } from "../../../tests/helpers/cartoon";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { definition } from "./definition";
import { run } from "./run";

describe("node outline (Dàn ý tập phim)", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const base = { shotCount: 36, own: "", provider: "fake" as const };
  const inputs = { idea: { kind: "text" as const, text: "Gián giành bánh kem sinh nhật của Mướp" }, character: testCastSet() };

  it("viết dàn ý 3 phần phủ đúng 36 cảnh; ra chữ để duyệt kèm số cảnh", async () => {
    const counter = countingFakeProviders();
    const out = await run(testNodeCtx(env, counter.providers), inputs, base);
    const o = out.outline;
    expect(o?.kind === "outline" && o.shotCount).toBe(36);
    expect(o?.kind === "outline" && o.text).toMatch(/Phần 1 · Gây chuyện/);
    expect(o?.kind === "outline" && o.text).toMatch(/Phần 3 · Chốt\n- Cảnh \d+–36:/);
    expect(counter.log.textPrompts[0]).toMatch(/đúng 36 cảnh/);
  });

  it("dàn ý sai (thiếu cảnh) → nhờ sửa trong cùng chat, lần 2 đúng", async () => {
    let bad = true;
    const counter = countingFakeProviders({
      textReply: (prompt) => {
        if (!prompt.startsWith("Bạn là")) bad = false;
        const beat = (from: number, to: number) => ({ from, to, what: "chuyện xảy ra", end: "bánh giữa bàn" });
        const reply = {
          title: "Tập thử",
          props: [],
          parts: [
            { name: "Gây chuyện", beats: [beat(1, 2)] },
            { name: "Leo thang", beats: [beat(3, bad ? 10 : 34)] },
            { name: "Chốt", beats: [beat(bad ? 11 : 35, bad ? 12 : 36)] },
          ],
        };
        return `\`\`\`json\n${JSON.stringify(reply)}\n\`\`\``;
      },
    });
    const out = await run(testNodeCtx(env, counter.providers), inputs, base);
    expect(counter.log.text).toBe(2);
    expect(counter.log.textSessions).toEqual(["new", "continue"]);
    expect(counter.log.textPrompts[1]).toMatch(/phủ đúng cảnh 1 đến 36/);
    expect(out.outline?.kind === "outline" && out.outline.shotCount).toBe(36);
  });

  it("gõ đè dàn ý: dùng luôn, không gọi dịch vụ; số cảnh 12–36", async () => {
    const counter = countingFakeProviders();
    const out = await run(testNodeCtx(env, counter.providers), inputs, { ...base, shotCount: 24, own: "Tên tập: Bánh kem\nPhần 1 …" });
    expect(out.outline).toEqual({ kind: "outline", title: "Bánh kem", text: "Tên tập: Bánh kem\nPhần 1 …", shotCount: 24 });
    expect(counter.log.text).toBe(0);
    expect(definition.params.safeParse({ ...base, shotCount: 40 }).success).toBe(false);
    expect(definition.params.safeParse({ ...base, shotCount: 8 }).success).toBe(false);
  });
});
