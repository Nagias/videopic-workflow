import { describe, expect, it } from "vitest";
import { testCastSet } from "../../tests/helpers/cartoon";
import type { Shot } from "./director";
import type { ImageSetValue } from "./ports";
import { keyframePrompt, motionPrompt } from "./prompts";
import { clipStep, keyframeStep, shotFromCache, textOnlyShot } from "./shot-plan";

const shot = (patch: Partial<Shot> = {}): Shot => ({
  id: "c02",
  size: "MS",
  angle: "eye",
  move: "static",
  subject: "character",
  link: "cut",
  start: "đứng cạnh bàn",
  motion: "nhảy lên bàn",
  props: "",
  ...patch,
});

const realCharacter: ImageSetValue = {
  kind: "imageset",
  role: "character",
  description: "cô gái áo đen",
  images: [
    { mediaId: "face", view: "face" },
    { mediaId: "front", view: "front" },
  ],
  session: { accountId: "a", threadUrl: "t" },
};
const realLocation: ImageSetValue = {
  kind: "imageset",
  role: "location",
  description: "sườn đồi",
  images: [{ mediaId: "wide", view: "wide" }],
  look: "ảnh điện thoại",
};
const cartoonLocation: ImageSetValue = { ...realLocation, description: "căn bếp", look: "Phong cách hoạt hình 2D. buổi tối", style: "hoat-hinh-2d" };

describe("dựng cảnh: người thật giữ nguyên, hoạt hình đi đường riêng", () => {
  it("người thật: khoá và prompt y hệt bản trước (chat phụ của nhân vật, keyframePrompt/motionPrompt cũ)", () => {
    const s = shot();
    const plan = keyframeStep({ shot: s, providerId: "fake", character: realCharacter, location: realLocation });
    const expected = keyframePrompt(s, {
      look: "ảnh điện thoại",
      location: "sườn đồi",
      props: [],
      refs: ["bối cảnh"],
      inChat: true,
      character: "cô gái áo đen",
    });
    expect(plan.prompt).toBe(expected);
    expect(plan.keyParts).toEqual(["keyframe", "fake", "chat", expected, ["face", "front"], ["wide"]]);
    expect(clipStep(s, "fake", realCharacter, "k1").prompt).toBe(motionPrompt(s, { character: "cô gái áo đen" }));
    expect(textOnlyShot(shot({ subject: "none" }), realCharacter)).toBe(true);
  });

  it("hoạt hình: chat mới, đính kèm cả dàn + từng nhân vật có mặt + bối cảnh; tông của bối cảnh hoạt hình", () => {
    const plan = keyframeStep({ shot: shot({ cast: ["gián Đỏ"] }), providerId: "fake", character: testCastSet(), location: cartoonLocation });
    expect(plan.chat).toBeUndefined();
    expect(plan.references.map((r) => r.mediaId)).toEqual(["lineup", "m2", "wide"]);
    expect(plan.prompt).toMatch(/ảnh 1: cả dàn nhân vật, đúng tỉ lệ kích thước; ảnh 2: gián Đỏ; ảnh 3: bối cảnh/);
    expect(plan.prompt).toMatch(/Phong cách hoạt hình 2D\. buổi tối/);
    expect(plan.keyParts[0]).toBe("keyframe-cartoon");
  });

  it("hoạt hình: hơn 3 nhân vật có mặt thì chỉ đính ảnh cả dàn; cảnh không nhân vật vẫn vẽ ảnh khung từ bối cảnh", () => {
    const many = testCastSet();
    many.members = [...(many.members ?? []), { name: "gián Vàng", look: "gián đeo kính vàng tròn", size: "cao 7 cm", trait: "" }];
    const all = keyframeStep({
      shot: shot({ cast: ["Mướp", "gián Đỏ", "gián Xanh", "gián Vàng"] }),
      providerId: "fake",
      character: many,
      location: cartoonLocation,
    });
    expect(all.references.map((r) => r.mediaId)).toEqual(["lineup", "wide"]);
    const empty = shot({ subject: "none", cast: [] });
    expect(textOnlyShot(empty, testCastSet())).toBe(false);
    expect(keyframeStep({ shot: empty, providerId: "fake", character: testCastSet(), location: cartoonLocation }).references.map((r) => r.mediaId)).toEqual([
      "wide",
    ]);
    // Ước tính khi chưa biết Nhân vật: cảnh có trường cast là cảnh hoạt hình → vẫn tính 1 ảnh khung.
    expect(shotFromCache(empty, { providerId: "fake" }, () => undefined).calls).toEqual({ image: 1, video: 1, text: 0 });
  });

  it("hoạt hình: prompt video theo luật hoạt hình, có cuối cảnh", () => {
    const p = clipStep(shot({ cast: ["Mướp"], end: "Mướp nằm dưới sàn" }), "fake", testCastSet(), "k1").prompt;
    expect(p).toMatch(/Cuối 5 giây: Mướp nằm dưới sàn/);
    expect(p).toMatch(/không nói thành lời/);
    expect(p).not.toMatch(/Chuyển động thật, có lực, đúng vật lý/);
  });
});
