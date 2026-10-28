import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { media } from "../../core/db/schema";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import type { Shot } from "../../shared/director";
import type { NodeInputs } from "../../core/node-runtime";
import type { NodeOutputs } from "../../shared/ports";
import { run as runCharacter } from "../character/run";
import { run as runLocation } from "../location/run";
import { referencesFor, run } from "./run";

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

  const refs = async (providers: ReturnType<typeof countingFakeProviders>["providers"]) => {
    const ctx = testNodeCtx(env, providers);
    const c = await runCharacter(ctx, {}, { description: "an adult Vietnamese woman in her early 20s, plain features", provider: "fake" });
    const l = await runLocation(ctx, {}, { description: "a hillside in Son La with a tent above a stream", provider: "fake" });
    return { character: c.character!, location: l.location! };
  };

  it("4 cảnh (cắt, nối, cảnh phụ, cắt): cảnh nối dùng khung cuối clip trước, ghép ra ~20 giây, storyboard đủ", async () => {
    const counter = countingFakeProviders();
    const { character, location } = await refs(counter.providers);
    expect(character.kind === "imageset" && character.images.map((i) => i.view)).toEqual(["face", "front", "side", "back"]);
    const imagesForRefs = counter.log.image;

    const shots = [shot("s1"), shot("s2", { link: "chain", size: "CU" }), shot("s3", { subject: "none", size: "EWS" }), shot("s4", { size: "WS" })];
    const partials: NodeOutputs[] = [];
    const ctx = testNodeCtx(env, counter.providers, [], partials);
    const inputs: NodeInputs = { character, location, shots: { kind: "shotlist", shots } };
    const out = await run(ctx, inputs, { provider: "fake", fixBrightness: true });

    expect(counter.log.image - imagesForRefs).toBe(3);
    const shotImagePrompts = counter.log.imagePrompts.slice(imagesForRefs);
    const shotSessions = counter.log.imageSessions.slice(imagesForRefs);
    expect(shotImagePrompts.filter((p) => /chính người trong các ảnh bạn đã tạo ở trên/.test(p)).length).toBe(2);
    expect(shotSessions.filter((s) => s === "continue").length).toBe(2);
    expect(shotSessions.filter((s) => s === "none").length).toBe(1);
    expect(counter.log.video).toBe(4);
    const video = out.video;
    expect(video?.kind).toBe("video");
    if (video?.kind === "video") {
      expect(video.durationSec).toBeGreaterThan(19.5);
      expect(video.durationSec).toBeLessThan(20.3);
      expect(video.width).toBe(1280);
    }
    const board = out.storyboard?.kind === "storyboard" ? out.storyboard.shots : [];
    expect(board.map((b) => b.status)).toEqual(["done", "done", "done", "done"]);
    const s2Frame = counter.log.firstFrames[counter.log.videoPrompts.findIndex((p) => p.includes("action s2"))];
    expect(env.storage.getMedia(s2Frame!)?.source).toBe("last-frame");
    expect(partials.length).toBeGreaterThan(4);
    const sources = env.db.select({ source: media.source }).from(media).all().map((m) => m.source);
    expect(sources).not.toContain("brightness-fix");
  });

  it("cảnh 2 lỗi: cảnh 3 (nối) bị bỏ qua, cảnh khác vẫn xong; chạy lại chỉ làm cảnh 2 và 3", async () => {
    let broken = true;
    const counter = countingFakeProviders({ failVideoWhen: (p) => broken && p.includes("action s2") });
    const { character, location } = await refs(counter.providers);
    const shots = [shot("s1"), shot("s2", { size: "WS" }), shot("s3", { link: "chain", size: "CU" }), shot("s4", { subject: "none", size: "EWS" })];
    const ctx = testNodeCtx(env, counter.providers);
    const inputs: NodeInputs = { character, location, shots: { kind: "shotlist", shots } };

    await expect(run(ctx, inputs, { provider: "fake", fixBrightness: false })).rejects.toThrow(/2\/4 cảnh chưa xong.*Cảnh 2: Lỗi giả lập.*Cảnh 3: Bỏ qua vì nối với cảnh 2/);
    const videosAfterFail = counter.log.video;

    broken = false;
    const out = await run(ctx, inputs, { provider: "fake", fixBrightness: false });
    expect(out.video?.kind).toBe("video");
    expect(counter.log.video - videosAfterFail).toBe(2);
  });

  it("chọn ảnh tham chiếu: cảnh có nhân vật gửi mặt + toàn thân + bối cảnh; cảnh phụ chỉ gửi bối cảnh", async () => {
    const counter = countingFakeProviders();
    const { character, location } = await refs(counter.providers);
    if (character.kind !== "imageset" || location.kind !== "imageset") throw new Error("sai kiểu");
    expect(referencesFor(shot("a"), character, location).map((r) => r.role)).toEqual(["character", "character", "location"]);
    expect(referencesFor(shot("b", { subject: "none" }), character, location).map((r) => r.role)).toEqual(["location", "location"]);
  });

  it("cầu dao: máy chủ video lỗi/quá giờ 3 lần thì không gửi thêm, cảnh còn lại bỏ qua kèm lý do", async () => {
    const counter = countingFakeProviders({ failVideoWhen: () => true, failCode: "NO_MEDIA" });
    const { character, location } = await refs(counter.providers);
    const sizes = ["WS", "MS", "CU", "WS", "MS", "CU"] as const;
    const shots = sizes.map((size, i) => shot(`b${i}`, { size, subject: "none" }));
    const partials: NodeOutputs[] = [];
    const ctx = testNodeCtx(env, counter.providers, [], partials);
    await expect(run(ctx, { character, location, shots: { kind: "shotlist", shots } }, { provider: "fake", fixBrightness: false })).rejects.toThrow(/6\/6 cảnh chưa xong/);
    expect(counter.log.video).toBeLessThanOrEqual(4);
    const last = partials.at(-1)?.storyboard;
    const board = last?.kind === "storyboard" ? last.shots : [];
    expect(board.filter((b) => b.status === "skipped" && /Dừng: dịch vụ báo lỗi máy chủ 3 lần/.test(b.error ?? "")).length).toBeGreaterThanOrEqual(2);
  });
});
