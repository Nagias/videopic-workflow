import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { definition } from "./definition";
import { run } from "./run";

describe("node props (Đồ vật)", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const items = [
    { name: "khúc gỗ", description: "khúc gỗ thông ngắn dài 40 cm, vỏ nâu", states: "nguyên khúc, bổ đôi" },
    { name: "rìu", description: "rìu nhỏ cán gỗ, lưỡi thép cũ", states: "nằm trên đất" },
  ];

  it("mỗi món một chat phụ: ảnh tĩnh vật trạng thái đầu, trạng thái sau tạo nối tiếp trong cùng chat; chạy lại không tạo lại", async () => {
    const counter = countingFakeProviders();
    const ctx = testNodeCtx(env, counter.providers);
    const params = definition.params.parse({ items, provider: "fake" });
    const out = await run(ctx, {}, params);
    const set = out.props;
    expect(set?.kind).toBe("props");
    if (set?.kind !== "props") return;
    expect(set.items.map((i) => [i.name, i.images.map((x) => x.state)])).toEqual([
      ["khúc gỗ", ["nguyên khúc", "bổ đôi"]],
      ["rìu", ["nằm trên đất"]],
    ]);
    expect(counter.log.image).toBe(3);
    expect(counter.log.imageSessions.filter((s) => s === "new")).toHaveLength(2);
    expect(counter.log.imageSessions.filter((s) => s === "continue")).toHaveLength(1);
    expect(counter.log.imagePrompts.find((p) => p.includes("nay ở trạng thái: bổ đôi"))).toBeDefined();
    await run(ctx, {}, params);
    expect(counter.log.image).toBe(3);
  });

  it("nối từ Biên kịch (cổng spec) thì dùng danh sách đó thay cho danh sách gõ tay", async () => {
    const counter = countingFakeProviders();
    const params = definition.params.parse({ items, provider: "fake" });
    const out = await run(testNodeCtx(env, counter.providers), { spec: { kind: "propspec", items: [{ name: "lều", description: "lều mái vòm xanh rêu", states: ["dựng"] }] } }, params);
    expect(out.props?.kind === "props" && out.props.items.map((i) => i.name)).toEqual(["lều"]);
    expect(counter.log.image).toBe(1);
  });

  it("nối Biên kịch mà kịch bản không có đồ vật nào → ra danh sách rỗng, không lỗi, không gọi dịch vụ", async () => {
    const counter = countingFakeProviders();
    const out = await run(testNodeCtx(env, counter.providers), { spec: { kind: "propspec", items: [] } }, definition.params.parse({ items: [], provider: "fake" }));
    expect(out.props).toEqual({ kind: "props", items: [] });
    expect(counter.log.image).toBe(0);
  });

  it("một món lỗi: các món khác vẫn xong và được giữ, lỗi nêu tên món; chạy lại chỉ làm món lỗi", async () => {
    let broken = true;
    const counter = countingFakeProviders({ failImageWhen: (p) => broken && p.includes("rìu") });
    const ctx = testNodeCtx(env, counter.providers);
    const params = definition.params.parse({ items, provider: "fake" });
    await expect(run(ctx, {}, params)).rejects.toThrow(/1\/2 đồ vật chưa xong.*rìu: Lỗi ảnh giả lập/);
    const afterFail = counter.log.image;
    expect(afterFail).toBe(3);
    broken = false;
    await run(ctx, {}, params);
    expect(counter.log.image - afterFail).toBe(1);
  });

  it("không có món nào, trùng tên hoặc thiếu trạng thái → lỗi rõ, không gọi dịch vụ", async () => {
    const counter = countingFakeProviders();
    const ctx = testNodeCtx(env, counter.providers);
    await expect(run(ctx, {}, definition.params.parse({ items: [], provider: "fake" }))).rejects.toThrow(/Chưa có đồ vật nào/);
    await expect(run(ctx, {}, definition.params.parse({ items: [items[1], items[1]], provider: "fake" }))).rejects.toThrow(/trùng tên "rìu"/);
    await expect(run(ctx, {}, definition.params.parse({ items: [{ ...items[1]!, states: " , " }], provider: "fake" }))).rejects.toThrow(/ít nhất một trạng thái/);
    expect(counter.log.image).toBe(0);
  });
});
