import { describe, expect, it } from "vitest";
import type { Shot } from "./director";
import {
  CHARACTER_SHEET,
  DEFAULT_LOOK,
  keyframePrompt,
  LOCATION_SHEET,
  motionPrompt,
  propStatePrompt,
  propStillPrompt,
  textVideoPrompt,
} from "./prompts";

const shot = (over: Partial<Shot> = {}): Shot => ({
  id: "a",
  size: "MS",
  angle: "low",
  move: "handheld",
  subject: "character",
  link: "cut",
  start: "cô gái đứng sau gốc cây, hai tay giơ cao chiếc rìu, khúc gỗ dựng trên gốc cây",
  motion: "cô bổ mạnh rìu xuống giữa khúc gỗ, gỗ tách đôi đổ sang hai bên",
  props: "khúc gỗ: nguyên khúc -> bổ đôi\nrìu: cầm tay",
  ...over,
});
const kctx = { look: DEFAULT_LOOK, location: "sườn đồi rừng Sơn La", props: [{ name: "khúc gỗ", state: "nguyên khúc", description: "khúc gỗ ngắn" }], refs: ["bối cảnh", "khúc gỗ (nguyên khúc)"], inChat: true };

const all = (): string[] => [
  keyframePrompt(shot(), kctx),
  keyframePrompt(shot({ subject: "none" }), { ...kctx, inChat: false }),
  keyframePrompt(shot({ subject: "hands" }), kctx),
  textVideoPrompt(shot({ subject: "none", props: "" }), { look: DEFAULT_LOOK, location: "suối" }),
  motionPrompt(shot()),
  ...CHARACTER_SHEET("một cô gái Việt Nam 20 tuổi", DEFAULT_LOOK).flatMap((v) => [v.prompt, v.inChatPrompt ?? ""]),
  ...LOCATION_SHEET("sườn đồi có suối", DEFAULT_LOOK).flatMap((v) => [v.prompt, v.inChatPrompt ?? ""]),
  propStillPrompt({ name: "rìu", description: "rìu cán gỗ", states: ["cầm tay"] }, DEFAULT_LOOK),
  propStatePrompt({ name: "khúc gỗ", description: "khúc gỗ", states: ["nguyên khúc", "bổ đôi"] }, "bổ đôi", DEFAULT_LOOK),
];

describe("prompt Muse chống nhựa", () => {
  it("không prompt nào dùng chữ kéo về kiểu ảnh quảng cáo", () => {
    for (const p of all()) expect(p).not.toMatch(/cinematic|photorealistic|\b2K\b/i);
  });

  it("prompt video luôn có 4 câu bắt buộc", () => {
    for (const p of [motionPrompt(shot()), textVideoPrompt(shot({ subject: "none", props: "" }), { look: DEFAULT_LOOK, location: "suối" })]) {
      for (const must of ["không nhìn vào máy quay", "không thêm người", "không cắt cảnh", "khung ngang 16:9"]) expect(p).toContain(must);
    }
  });

  it("prompt chuyển động chỉ tả việc sau khung đầu, nêu trạng thái cuối của đồ vật", () => {
    const p = motionPrompt(shot());
    expect(p).not.toContain("đứng sau gốc cây");
    expect(p).toContain("cô bổ mạnh rìu xuống");
    expect(p).toContain("Cuối cảnh: khúc gỗ bổ đôi");
    expect(p).toContain("máy cầm tay hơi rung tự nhiên");
  });

  it("ảnh khung: cỡ cảnh/góc máy tiếng Việt, khung đầu, chú thích ảnh đính kèm, tông ảnh, nói rõ chưa có hành động", () => {
    const p = keyframePrompt(shot(), kctx);
    expect(p).toContain("trung cảnh");
    expect(p).toContain("máy đặt thấp nhìn lên");
    expect(p).toContain("khúc gỗ dựng trên gốc cây");
    expect(p).toContain("ảnh 1: bối cảnh; ảnh 2: khúc gỗ (nguyên khúc)");
    expect(p).toContain(DEFAULT_LOOK);
    expect(p).toContain("chính người trong các ảnh bạn đã tạo ở trên");
    expect(keyframePrompt(shot({ subject: "hands" }), kctx)).toContain("Chỉ thấy bàn tay");
    expect(keyframePrompt(shot({ subject: "none" }), { ...kctx, inChat: false })).toContain("không có người");
  });

  it("bộ ảnh mẫu nhân vật 4 góc, bối cảnh 2 ảnh, đồ vật nêu trạng thái và không có tay người", () => {
    expect(CHARACTER_SHEET("x", DEFAULT_LOOK).map((v) => v.view)).toEqual(["face", "front", "side", "back"]);
    expect(LOCATION_SHEET("x", DEFAULT_LOOK).map((v) => v.view)).toEqual(["wide", "close"]);
    const still = propStillPrompt({ name: "rìu", description: "rìu cán gỗ", states: ["cầm tay"] }, DEFAULT_LOOK);
    expect(still).toContain("rìu cán gỗ");
    expect(still).toContain("không có tay người");
    expect(propStatePrompt({ name: "khúc gỗ", description: "khúc gỗ", states: ["nguyên khúc", "bổ đôi"] }, "bổ đôi", DEFAULT_LOOK)).toContain("nay ở trạng thái: bổ đôi");
  });
});
