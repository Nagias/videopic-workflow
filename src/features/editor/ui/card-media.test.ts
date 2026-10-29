import { describe, expect, it } from "vitest";
import type { NodeOutputs } from "../../../shared/ports";
import { pickCardMedia, videoSecondsOf } from "./card-media";

const video = { kind: "video", mediaId: "clip1", durationSec: 5, width: 1280, height: 720 } as const;
const image = (mediaId: string) => ({ kind: "image", mediaId, width: 1280, height: 720 }) as const;

describe("pickCardMedia — thân thẻ chọn cái đáng xem nhất", () => {
  it("có video thì khung video, ảnh khung của Cảnh làm poster", () => {
    const out: NodeOutputs = { clip: video, frame: image("f1"), last: image("l1") };
    expect(pickCardMedia("scene", {}, out)).toEqual({ kind: "video", mediaId: "clip1", poster: "f1" });
  });

  it("video không có ảnh thì không có poster", () => {
    expect(pickCardMedia("generate-video", {}, { video })).toEqual({ kind: "video", mediaId: "clip1" });
  });

  it("Cảnh đang chạy mới có ảnh khung: hiện ảnh 16:9", () => {
    expect(pickCardMedia("scene", {}, { frame: image("f1") })).toEqual({ kind: "image", mediaId: "f1" });
  });

  it("bộ ảnh nhân vật: tối đa 4 ảnh (lưới 2×2)", () => {
    const images = ["a", "b", "c", "d", "e"].map((m) => ({ mediaId: m, view: "face" }));
    const out: NodeOutputs = { character: { kind: "imageset", role: "character", description: "x", images } };
    expect(pickCardMedia("character", {}, out)).toEqual({ kind: "imageset", mediaIds: ["a", "b", "c", "d"] });
  });

  it("đồ vật: ảnh đầu của từng món, bỏ món chưa có ảnh", () => {
    const out: NodeOutputs = {
      props: {
        kind: "props",
        items: [
          { name: "rìu", description: "", images: [{ mediaId: "p1", state: "mới" }] },
          { name: "gỗ", description: "", images: [] },
          { name: "lều", description: "", images: [{ mediaId: "p3", state: "dựng" }] },
        ],
      },
    };
    expect(pickCardMedia("props", {}, out)).toEqual({ kind: "props", mediaIds: ["p1", "p3"] });
  });

  it("kịch bản của Biên kịch: tối đa 5 dòng chuyển động", () => {
    const shots = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`,
      size: "MS" as const,
      angle: "eye" as const,
      move: "static" as const,
      subject: "character" as const,
      link: "cut" as const,
      start: "",
      motion: `việc ${i + 1}`,
      props: "",
    }));
    const media = pickCardMedia("writer", {}, { shots: { kind: "shotlist", shots } });
    expect(media).toEqual({ kind: "text", text: "1. việc 1\n2. việc 2\n3. việc 3\n4. việc 4\n5. việc 5" });
  });

  it("Prompt luôn hiện chữ đang viết (kể cả chưa chạy); trống thì ô trống", () => {
    expect(pickCardMedia("prompt", { text: "  Rừng sương  " }, undefined)).toEqual({ kind: "text", text: "Rừng sương" });
    expect(pickCardMedia("prompt", { text: "   " }, undefined)).toEqual({ kind: "empty" });
  });

  it("chưa có kết quả thì ô trống", () => {
    expect(pickCardMedia("scene", {}, undefined)).toEqual({ kind: "empty" });
    expect(pickCardMedia("scene", {}, null)).toEqual({ kind: "empty" });
  });
});

describe("videoSecondsOf", () => {
  it("lấy thời lượng video, không có video thì undefined", () => {
    expect(videoSecondsOf({ clip: video })).toBe(5);
    expect(videoSecondsOf({ frame: image("f") })).toBeUndefined();
    expect(videoSecondsOf(undefined)).toBeUndefined();
  });
});
