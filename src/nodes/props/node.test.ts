import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { DEFAULT_LOOK } from "../../shared/prompts";
import { definition, orphanPhotos, propStepKey } from "./definition";
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

  it("ước tính lượt: 1 ảnh mỗi trạng thái chưa có trong cache bước con; nối Biên kịch chưa có kết quả → không ước được; predict ra đúng kết quả chạy", async () => {
    const params = definition.params.parse({ items, provider: "fake" });
    const none = new Set<string>();
    expect(definition.estimate?.(params, none)).toEqual({ image: 3, video: 0, text: 0 });
    expect(definition.estimate?.(params, new Set(["spec"]))).toBeUndefined();

    // Chạy với bộ nhớ bước con riêng, rồi ước tính/dự đoán bằng chính bộ nhớ đó.
    const counter = countingFakeProviders();
    const steps = new Map<string, unknown>();
    const ctx = testNodeCtx(env, counter.providers);
    const ran = await run({ ...ctx, step: async (k, fn) => { const v = await ctx.step(k, fn); steps.set(JSON.stringify(k), v); return v; } }, {}, params);
    const known = { inputs: {}, step: (k: unknown) => steps.get(JSON.stringify(k)), media: (id: string) => env.storage.getMedia(id) };
    expect(definition.estimate?.(params, none, known)).toEqual({ image: 0, video: 0, text: 0 });
    expect(definition.predict?.(params, none, known)).toEqual(ran);
    steps.delete([...steps.keys()][1]!);
    expect(definition.estimate?.(params, none, known)).toEqual({ image: 1, video: 0, text: 0 });
    expect(definition.predict?.(params, none, known)).toBeUndefined();
  });
});

describe("node props (Đồ vật) — ảnh thật theo trạng thái", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  // Ảnh "tải lên" giả: ảnh màu đơn sắc nhập qua storage như route tải ảnh làm.
  const photo = async (colorHex: string): Promise<string> => {
    const out = await env.storage.tmpPath("jpg");
    await env.ffmpeg.makeTestImage({ out, colorHex, width: 400, height: 300 });
    return (await env.storage.importFile(out, { kind: "image", source: "upload", width: 400, height: 300 })).id;
  };
  const table = (photos: Record<string, string[]>, states = "gấp phẳng, có chân, nâng cao, trong túi") => ({
    items: [{ name: "Bàn gấp", description: "bàn dã ngoại gấp gọn mặt nhôm xám", states, photos }],
    provider: "fake",
  });
  const imagesOf = (out: Awaited<ReturnType<typeof run>>) => (out.props?.kind === "props" ? out.props.items[0]!.images : []);

  it("đủ ảnh thật mọi trạng thái → 0 lượt, images là ảnh thật theo thứ tự trạng thái, nhiều ảnh một trạng thái thì ảnh đầu đứng trước", async () => {
    const [a1, a2, b, c, d] = [await photo("111111"), await photo("222222"), await photo("333333"), await photo("444444"), await photo("555555")];
    const counter = countingFakeProviders();
    const out = await run(testNodeCtx(env, counter.providers), {}, definition.params.parse(table({ "nâng cao": [c], "gấp phẳng": [a1, a2], "trong túi": [d], "có chân": [b] })));
    expect(imagesOf(out)).toEqual([
      { mediaId: a1, state: "gấp phẳng" },
      { mediaId: a2, state: "gấp phẳng" },
      { mediaId: b, state: "có chân" },
      { mediaId: c, state: "nâng cao" },
      { mediaId: d, state: "trong túi" },
    ]);
    expect(counter.log.image).toBe(0);
  });

  it("thiếu một trạng thái → 1 lượt, chat mới, đính kèm ảnh thật (tối đa 2, role prop), prompt giữ logo; chạy lại → không thêm lượt", async () => {
    const [a1, a2, a3, b, c] = [await photo("111111"), await photo("222222"), await photo("333333"), await photo("444444"), await photo("555555")];
    const counter = countingFakeProviders();
    const ctx = testNodeCtx(env, counter.providers);
    const params = definition.params.parse(table({ "gấp phẳng": [a1, a2, a3], "có chân": [b], "nâng cao": [c] }));
    const out = await run(ctx, {}, params);
    expect(counter.log.image).toBe(1);
    expect(counter.log.imageSessions).toEqual(["new"]);
    expect(counter.log.imageRefs[0]).toEqual([
      { mediaId: a1, role: "prop" },
      { mediaId: a2, role: "prop" },
    ]);
    expect(counter.log.imagePrompts[0]).toContain("chữ và logo in trên sản phẩm");
    expect(counter.log.imagePrompts[0]).toContain("trong túi");
    expect(imagesOf(out).map((x) => x.state)).toEqual(["gấp phẳng", "gấp phẳng", "gấp phẳng", "có chân", "nâng cao", "trong túi"]);
    await run(ctx, {}, params);
    expect(counter.log.image).toBe(1);
  });

  it("thiếu hai trạng thái → trạng thái thiếu thứ hai vẽ nối tiếp trong cùng chat", async () => {
    const a = await photo("111111");
    const counter = countingFakeProviders();
    await run(testNodeCtx(env, counter.providers), {}, definition.params.parse(table({ "gấp phẳng": [a] }, "gấp phẳng, có chân, trong túi")));
    expect(counter.log.imageSessions).toEqual(["new", "continue"]);
    expect(counter.log.imagePrompts[1]).toContain("chữ và logo in trên sản phẩm");
    expect(counter.log.imagePrompts[1]).not.toContain("Không chữ.");
  });

  it("chỉ có ảnh ở trạng thái thứ hai → trạng thái đầu vẽ từ ảnh đó, images vẫn theo thứ tự trạng thái", async () => {
    const b = await photo("444444");
    const counter = countingFakeProviders();
    const out = await run(testNodeCtx(env, counter.providers), {}, definition.params.parse(table({ "có chân": [b] }, "gấp phẳng, có chân")));
    expect(counter.log.imageRefs[0]).toEqual([{ mediaId: b, role: "prop" }]);
    expect(imagesOf(out).map((x) => x.state)).toEqual(["gấp phẳng", "có chân"]);
    expect(imagesOf(out)[1]!.mediaId).toBe(b);
  });

  it("đổi tên trạng thái có ảnh → ảnh thành mồ côi, trạng thái mới vẽ từ ảnh mồ côi, ảnh mồ côi không vào images", async () => {
    const a = await photo("111111");
    const row = { name: "Bàn gấp", description: "bàn dã ngoại gấp gọn", states: "xếp gọn", photos: { "gấp phẳng": [a] } };
    expect(orphanPhotos(row)).toEqual([a]);
    const counter = countingFakeProviders();
    const out = await run(testNodeCtx(env, counter.providers), {}, definition.params.parse({ items: [row], provider: "fake" }));
    expect(counter.log.imageRefs[0]).toEqual([{ mediaId: a, role: "prop" }]);
    expect(imagesOf(out).map((x) => x.mediaId)).not.toContain(a);
  });

  it("đổi ảnh thật → khoá bước con đổi, vẽ lại", async () => {
    const [a, a2] = [await photo("111111"), await photo("999999")];
    const counter = countingFakeProviders();
    const ctx = testNodeCtx(env, counter.providers);
    await run(ctx, {}, definition.params.parse(table({ "gấp phẳng": [a] }, "gấp phẳng, có chân")));
    await run(ctx, {}, definition.params.parse(table({ "gấp phẳng": [a2] }, "gấp phẳng, có chân")));
    expect(counter.log.image).toBe(2);
  });

  it("món không có ảnh thật → khoá bước con y hệt bản cũ, base rỗng không đổi khoá", () => {
    const item = { name: "rìu", description: "rìu nhỏ cán gỗ", states: ["nằm trên đất", "cầm tay"] };
    expect(propStepKey("fake", item, 1)).toEqual(["prop", "fake", "rìu", "rìu nhỏ cán gỗ", ["nằm trên đất", "cầm tay"], DEFAULT_LOOK]);
    expect(propStepKey("fake", item, 1, [])).toEqual(propStepKey("fake", item, 1));
    expect(propStepKey("fake", item, 1, ["m1"])).toEqual([...propStepKey("fake", item, 1), "photos", "m1"]);
  });

  it("ước tính chỉ đếm trạng thái không có ảnh thật và chưa có cache; predict ra đúng kết quả chạy", async () => {
    const [a, b] = [await photo("111111"), await photo("444444")];
    const params = definition.params.parse(table({ "gấp phẳng": [a], "có chân": [b] }));
    const none = new Set<string>();
    expect(definition.estimate?.(params, none)).toEqual({ image: 2, video: 0, text: 0 });
    const counter = countingFakeProviders();
    const steps = new Map<string, unknown>();
    const ctx = testNodeCtx(env, counter.providers);
    const ran = await run({ ...ctx, step: async (k, fn) => { const v = await ctx.step(k, fn); steps.set(JSON.stringify(k), v); return v; } }, {}, params);
    const known = { inputs: {}, step: (k: unknown) => steps.get(JSON.stringify(k)), media: (id: string) => env.storage.getMedia(id) };
    expect(definition.estimate?.(params, none, known)).toEqual({ image: 0, video: 0, text: 0 });
    expect(definition.predict?.(params, none, known)).toEqual(ran);
  });

  it("thẻ node có ảnh thật ghi số ảnh thật và số ảnh sẽ vẽ", async () => {
    const [a, b, c] = [await photo("111111"), await photo("444444"), await photo("555555")];
    const params = definition.params.parse(table({ "gấp phẳng": [a], "có chân": [b], "nâng cao": [c] }));
    expect(definition.cardLine?.(params, undefined)).toBe("Bàn gấp · 3 ảnh thật · 1 ảnh vẽ");
  });

  it("thẻ node cảnh báo món chưa có ảnh thật khi món khác đã có", async () => {
    const a1 = await photo("111111");
    const params = definition.params.parse({
      items: [
        { name: "Bàn gấp", description: "bàn dã ngoại gấp gọn", states: "gấp phẳng", photos: { "gấp phẳng": [a1] } },
        { name: "Ghế gấp", description: "ghế xếp cùng bộ", states: "mở" },
      ],
      provider: "fake",
    });
    expect(definition.cardLine?.(params, undefined)).toBe("2 đồ vật · 1 ảnh thật · 1 ảnh vẽ · 1 món chưa có ảnh thật");
  });
});
