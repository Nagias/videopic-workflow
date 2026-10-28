import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { media } from "../../core/db/schema";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { ShotSchema, type Shot } from "../../shared/director";
import type { NodeInputs } from "../../core/node-runtime";
import type { NodeOutputs, PortValue } from "../../shared/ports";
import { run as runCharacter } from "../character/run";
import { run as runLocation } from "../location/run";
import { run as runProps } from "../props/run";
import { run } from "./run";

const shot = (id: string, over: Partial<Shot> = {}): Shot => ({
  id,
  size: "MS",
  angle: "eye",
  move: "static",
  subject: "character",
  link: "cut",
  start: `start ${id}`,
  motion: `action ${id}`,
  props: "",
  ...over,
});

describe("node film (Dựng phim)", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const refs = async (providers: ReturnType<typeof countingFakeProviders>["providers"], withProps = false) => {
    const ctx = testNodeCtx(env, providers);
    const c = await runCharacter(ctx, {}, { description: "an adult Vietnamese woman in her early 20s, plain features", provider: "fake" });
    const l = await runLocation(ctx, {}, { description: "sườn đồi Sơn La có suối đá bên dưới", provider: "fake" });
    const p = withProps
      ? await runProps(ctx, {}, { items: [{ name: "khúc gỗ", description: "khúc gỗ thông ngắn", states: "nguyên khúc, bổ đôi" }], provider: "fake" })
      : {};
    return { character: c.character!, location: l.location!, ...(p.props ? { props: p.props } : {}) } as Record<string, PortValue>;
  };

  it("4 cảnh (cắt, nối, B-roll không đồ vật, cắt): B-roll đi chữ→video, nối dùng khung cuối, ghép ~20 giây, không file bù sáng trung gian", async () => {
    const counter = countingFakeProviders();
    const base = await refs(counter.providers);
    const imagesForRefs = counter.log.image;

    const shots = [shot("s1"), shot("s2", { link: "chain", size: "CU", start: "" }), shot("s3", { subject: "none", size: "EWS" }), shot("s4", { size: "WS" })];
    const partials: NodeOutputs[] = [];
    const ctx = testNodeCtx(env, counter.providers, [], partials);
    const out = await run(ctx, { ...base, shots: { kind: "shotlist", shots } }, { provider: "fake", fixBrightness: true });

    expect(counter.log.image - imagesForRefs).toBe(2);
    expect(counter.log.imageSessions.slice(imagesForRefs)).toEqual(["continue", "continue"]);
    expect(counter.log.video).toBe(4);
    const idx = (id: string) => counter.log.videoPrompts.findIndex((p) => p.includes(`action ${id}`));
    expect(counter.log.firstFrames[idx("s3")]).toBeUndefined();
    expect(counter.log.videoPrompts[idx("s3")]).toMatch(/^Tạo video 5 giây: start s3/);
    expect(env.storage.getMedia(counter.log.firstFrames[idx("s2")]!)?.source).toBe("last-frame");
    const video = out.video;
    expect(video?.kind === "video" && video.durationSec).toBeGreaterThan(19.5);
    expect(video?.kind === "video" && video.durationSec).toBeLessThan(20.3);
    const board = out.storyboard?.kind === "storyboard" ? out.storyboard.shots : [];
    expect(board.map((b) => b.status)).toEqual(["done", "done", "done", "done"]);
    expect(board[2]?.keyframeId).toBeDefined();
    expect(partials.length).toBeGreaterThan(4);
    const sources = env.db.select({ source: media.source }).from(media).all().map((m) => m.source);
    expect(sources).not.toContain("brightness-fix");
  });

  it("cảnh có nhân vật + đồ vật: ảnh khung trong chat nhân vật, đính kèm bối cảnh + ảnh mẫu đúng trạng thái đầu", async () => {
    const counter = countingFakeProviders();
    const base = await refs(counter.providers, true);
    const props = base.props?.kind === "props" ? base.props : undefined;
    const before = counter.log.image;
    const shots = [shot("a", { props: "khúc gỗ: nguyên khúc -> bổ đôi" }), shot("b", { size: "INSERT", subject: "hands", props: "khúc gỗ: bổ đôi" })];
    await run(testNodeCtx(env, counter.providers), { ...base, shots: { kind: "shotlist", shots } }, { provider: "fake", fixBrightness: false });
    const intact = props?.items[0]?.images.find((i) => i.state === "nguyên khúc")?.mediaId;
    const split = props?.items[0]?.images.find((i) => i.state === "bổ đôi")?.mediaId;
    expect(counter.log.imageRefs.slice(before).map((r) => r.map((x) => x.role))).toEqual([
      ["location", "prop"],
      ["location", "prop"],
    ]);
    expect(counter.log.imageRefs[before]![1]!.mediaId).toBe(intact);
    expect(counter.log.imageRefs[before + 1]![1]!.mediaId).toBe(split);
    expect(counter.log.imagePrompts[before]).toContain("ảnh 2: khúc gỗ (nguyên khúc)");
    expect(counter.log.imagePrompts[before + 1]).toContain("Chỉ thấy bàn tay");
    expect(counter.log.videoPrompts[0]).toContain("Cuối cảnh: khúc gỗ bổ đôi");
    expect(counter.log.videoPrompts.every((p) => p.includes("Trang phục giữ nguyên suốt clip: an adult Vietnamese woman"))).toBe(true);
  });

  it("B-roll không người nhưng có đồ vật: ảnh khung mới (chat mới) có đính kèm, không đi chữ→video", async () => {
    const counter = countingFakeProviders();
    const base = await refs(counter.providers, true);
    const before = counter.log.image;
    await run(
      testNodeCtx(env, counter.providers),
      { ...base, shots: { kind: "shotlist", shots: [shot("x", { subject: "none", props: "khúc gỗ: nguyên khúc" })] } },
      { provider: "fake", fixBrightness: false },
    );
    expect(counter.log.imageSessions.slice(before)).toEqual(["new"]);
    expect(counter.log.imagePrompts[before]).toContain("không có người");
    expect(counter.log.firstFrames[0]).toBeDefined();
  });

  it("tên hoặc trạng thái đồ vật không khớp node Đồ vật → lỗi trước khi gọi dịch vụ", async () => {
    const counter = countingFakeProviders();
    const base = await refs(counter.providers, true);
    const before = { image: counter.log.image, video: counter.log.video };
    const inputs: NodeInputs = { ...base, shots: { kind: "shotlist", shots: [shot("a", { props: "cái búa: cầm tay" })] } };
    await expect(run(testNodeCtx(env, counter.providers), inputs, { provider: "fake", fixBrightness: false })).rejects.toThrow(/chưa có đồ vật "cái búa"/);
    expect(counter.log.image).toBe(before.image);
    expect(counter.log.video).toBe(before.video);
  });

  it("cảnh dạng cũ (`action`) vẫn ra phim", async () => {
    const counter = countingFakeProviders();
    const base = await refs(counter.providers);
    const old = ShotSchema.parse({ id: "o", size: "WS", angle: "eye", move: "static", subject: "character", link: "cut", action: "cô đi về phía lều" });
    const out = await run(testNodeCtx(env, counter.providers), { ...base, shots: { kind: "shotlist", shots: [old] } }, { provider: "fake", fixBrightness: true });
    expect(out.video?.kind).toBe("video");
  });

  it("cảnh 2 lỗi: cảnh 3 (nối) bị bỏ qua, cảnh khác vẫn xong; chạy lại chỉ làm cảnh 2 và 3", async () => {
    let broken = true;
    const counter = countingFakeProviders({ failVideoWhen: (p) => broken && p.includes("action s2") });
    const base = await refs(counter.providers);
    const shots = [shot("s1"), shot("s2", { size: "WS" }), shot("s3", { link: "chain", size: "CU", start: "" }), shot("s4", { subject: "none", size: "EWS" })];
    const ctx = testNodeCtx(env, counter.providers);
    const inputs: NodeInputs = { ...base, shots: { kind: "shotlist", shots } };

    await expect(run(ctx, inputs, { provider: "fake", fixBrightness: false })).rejects.toThrow(/2\/4 cảnh chưa xong.*Cảnh 2: Lỗi giả lập.*Cảnh 3: Bỏ qua vì nối với cảnh 2/);
    const videosAfterFail = counter.log.video;

    broken = false;
    const out = await run(ctx, inputs, { provider: "fake", fixBrightness: false });
    expect(out.video?.kind).toBe("video");
    expect(counter.log.video - videosAfterFail).toBe(2);
  });

  it("cầu dao: máy chủ video lỗi/quá giờ 3 lần thì không gửi thêm, cảnh còn lại bỏ qua kèm lý do", async () => {
    const counter = countingFakeProviders({ failVideoWhen: () => true, failCode: "NO_MEDIA" });
    const base = await refs(counter.providers);
    const sizes = ["WS", "MS", "CU", "WS", "MS", "CU"] as const;
    const shots = sizes.map((size, i) => shot(`b${i}`, { size, subject: "none" }));
    const partials: NodeOutputs[] = [];
    const ctx = testNodeCtx(env, counter.providers, [], partials);
    await expect(run(ctx, { ...base, shots: { kind: "shotlist", shots } }, { provider: "fake", fixBrightness: false })).rejects.toThrow(/6\/6 cảnh chưa xong/);
    expect(counter.log.video).toBeLessThanOrEqual(4);
    const last = partials.at(-1)?.storyboard;
    const board = last?.kind === "storyboard" ? last.shots : [];
    expect(board.filter((b) => b.status === "skipped" && /Dừng: dịch vụ báo lỗi máy chủ 3 lần/.test(b.error ?? "")).length).toBeGreaterThanOrEqual(2);
  });
});
