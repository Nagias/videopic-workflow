import { describe, expect, it } from "vitest";
import { fmtSec, shorten } from "../shared/card-line";
import type { NodeOutputs } from "../shared/ports";
import { definition as character } from "./character/definition";
import { definition as combine } from "./film-combine/definition";
import { definition as film } from "./film/definition";
import { definition as generateVideo } from "./generate-video/definition";
import { definition as prompt } from "./prompt/definition";
import { definition as scene } from "./scene/definition";
import { definition as shotlist } from "./shotlist/definition";
import { definition as writer } from "./writer/definition";

const sceneParams = { ...scene.defaults, size: "MS" as const, motion: "cô đi về phía lều" };

describe("fmtSec / shorten", () => {
  it("số giây kiểu Việt", () => {
    expect(fmtSec(59.8)).toBe("59,8 giây");
    expect(fmtSec(5)).toBe("5 giây");
    expect(fmtSec(4.96)).toBe("5 giây");
  });

  it("rút gọn chữ, gộp xuống dòng", () => {
    expect(shorten("a\n  b", 10)).toBe("a b");
    expect(shorten("1234567890", 6)).toBe("12345…");
    expect(shorten(undefined, 6)).toBe("");
  });
});

describe("cardLine — dòng chân thẻ", () => {
  it("Cảnh: cỡ cảnh · cắt/nối · chuyển động rút gọn", () => {
    expect(scene.cardLine?.(sceneParams, undefined, {})).toBe("MS · cắt · cô đi về phía lều");
    expect(scene.cardLine?.(sceneParams, undefined, { follow: 1 })).toBe("MS · nối · cô đi về phía lều");
    expect(scene.cardLine?.({ ...sceneParams, motion: "" }, undefined, {})).toBe("MS · cắt · chưa viết chuyển động");
    expect(scene.cardLine?.({ ...sceneParams, motion: "x".repeat(80) }, undefined, {})).toHaveLength("MS · cắt · ".length + 40);
  });

  it("Biên kịch: số cảnh và số đồ vật khi đã có kịch bản", () => {
    const shots = Array.from({ length: 12 }, (_, i) => ({ ...sceneShotLike, id: `c${i}` }));
    const props = Array.from({ length: 6 }, (_, i) => ({ name: `đồ ${i}`, description: "mô tả đồ vật", states: ["a"] }));
    const out: NodeOutputs = { shots: { kind: "shotlist", shots }, props: { kind: "propspec", items: props } };
    expect(writer.cardLine?.(writer.defaults, out)).toBe("12 cảnh · 6 đồ vật");
    expect(writer.cardLine?.(writer.defaults, undefined)).toBe("12 cảnh dự kiến");
  });

  it("Ghép phim: thời lượng và số clip đang cắm vào", () => {
    const out: NodeOutputs = { video: { kind: "video", mediaId: "m", durationSec: 59.8, width: 1280, height: 720 } };
    expect(combine.cardLine?.(combine.defaults, out, { clips: 12 })).toBe("59,8 giây · 12 clip");
    expect(combine.cardLine?.(combine.defaults, undefined, { clips: 3 })).toBe("3 clip");
    expect(combine.cardLine?.(combine.defaults, undefined, {})).toBe("0 clip");
  });

  it("Prompt, Tạo video, Nhân vật", () => {
    expect(prompt.cardLine?.({ text: "một hai ba" })).toBe("3 từ");
    expect(prompt.cardLine?.({ text: "  " })).toBe("chưa có chữ");
    expect(generateVideo.cardLine?.({ provider: "muse", durationSec: 10 })).toBe("Muse (thật) · 10 giây");
    expect(character.cardLine?.({ name: "Mai", description: "", provider: "fake" })).toBe("Mai");
    const out: NodeOutputs = { character: { kind: "imageset", role: "character", description: "x", images: [{ mediaId: "a", view: "face" }] } };
    expect(character.cardLine?.({ name: "Mai", description: "", provider: "fake" }, out)).toBe("Mai · 1 ảnh");
  });

  it("tham số lạ (workflow cũ, dịch vụ không còn) vẫn ra một dòng, không ném lỗi", () => {
    expect(film.cardLine?.({ provider: "khong-co" as never, fixBrightness: true })).toBe("khong-co");
    expect(shotlist.cardLine?.({} as never)).toBe("0 cảnh");
    expect(scene.cardLine?.({} as never, undefined, {})).toBe("cắt · chưa viết chuyển động");
  });
});

const sceneShotLike = {
  size: "MS" as const,
  angle: "eye" as const,
  move: "static" as const,
  subject: "character" as const,
  link: "cut" as const,
  start: "",
  motion: "việc",
  props: "",
};
