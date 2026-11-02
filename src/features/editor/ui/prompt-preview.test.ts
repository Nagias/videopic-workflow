import { describe, expect, it } from "vitest";
import { sceneShot, type SceneParams } from "../../../nodes/scene/definition";
import { clipStep, keyframeStep, textClipStep } from "../../../shared/shot-plan";
import type { ImageSetValue, NodeOutputs } from "../../../shared/ports";
import { writerPrompt } from "../../../shared/prompts";
import { definition as writerDefinition, params as writerParams } from "../../../nodes/writer/definition";
import { PROMPT_AT_RUN, promptPreview } from "./prompt-preview";

const scene = (over: Partial<SceneParams> = {}): SceneParams => ({
  size: "MS",
  angle: "eye",
  move: "static",
  subject: "character",
  start: "cô đứng bên suối",
  motion: "cô cúi xuống múc nước",
  props: "",
  provider: "fake",
  ...over,
});

const node = (id: string, type: string, params: Record<string, unknown>) => ({ id, type, data: { params } });
const wire = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({ source, sourceHandle, target, targetHandle });
const noOutput = () => undefined;

const character = node("c", "character", { name: "Mai", description: "cô gái tóc đen, áo khoác xám", provider: "fake" });
const location = node("l", "location", { description: "bãi cỏ bên suối đá", provider: "fake" });
const nodes = (s: SceneParams) => [character, location, node("s", "scene", s)];
const edges = [wire("c", "character", "s", "character"), wire("l", "location", "s", "location")];

const sets = (): { character: ImageSetValue; location: ImageSetValue } => ({
  character: { kind: "imageset", role: "character", description: "cô gái tóc đen, áo khoác xám", images: [] },
  location: { kind: "imageset", role: "location", description: "bãi cỏ bên suối đá", images: [] },
});

describe("promptPreview — Cảnh", () => {
  it("cảnh cắt có người: prompt ảnh khung và prompt video đúng như máy chủ dựng (shot-plan)", () => {
    const p = scene();
    const { character: ch, location: lo } = sets();
    const r = promptPreview("s", nodes(p), edges, noOutput);
    const shot = sceneShot(p, false);
    if ("note" in r) throw new Error("phải có prompt");
    expect(r.sections.map((s) => s.text)).toEqual([keyframeStep({ shot, providerId: "fake", character: ch, location: lo }).prompt, clipStep(shot, "fake", ch, "").prompt]);
    expect(r.sections[0]!.title).toContain("ảnh khung");
    expect(r.sections[1]!.title).toContain("video");
    const text = JSON.stringify(r);
    expect(text).toContain("không nhìn vào máy quay");
    expect(text).toContain("cô gái tóc đen, áo khoác xám");
  });

  it("cảnh nối (có dây Nối tiếp): không có prompt ảnh, chỉ prompt video", () => {
    const prev = node("prev", "scene", scene());
    const r = promptPreview("s", [...nodes(scene({ start: "" })), prev], [...edges, wire("prev", "clip", "s", "follow")], noOutput);
    if ("note" in r) throw new Error("phải có prompt");
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0]!.title).toContain("Prompt video");
    expect(r.notes).toHaveLength(1);
    expect(r.notes![0]).toContain("Khung đầu");
    expect(r.sections.map((x) => x.text).join("\n")).not.toContain("Khung đầu:");
    expect(r.sections[0]!.text).toBe(clipStep(sceneShot(scene({ start: "" }), true), "fake", sets().character, "").prompt);
  });

  it("cảnh không người, không đồ vật: một prompt chữ → video", () => {
    const p = scene({ subject: "none" });
    const r = promptPreview("s", nodes(p), edges, noOutput);
    if ("note" in r) throw new Error("phải có prompt");
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0]!.text).toBe(textClipStep(sceneShot(p, false), "fake", sets().location).prompt);
    expect(r.sections[0]!.text).toContain("không nhìn vào máy quay");
  });

  it("chưa nối Nhân vật / Không gian: nói rõ chỗ trống trong prompt", () => {
    const r = promptPreview("s", [node("s", "scene", scene())], [], noOutput);
    expect(JSON.stringify(r)).toContain("(chưa nối Nhân vật)");
  });

  it("nguồn đã chạy: dùng đúng bộ ảnh của kết quả (có chat phụ thì prompt nối tiếp trong chat)", () => {
    const real: ImageSetValue = {
      kind: "imageset",
      role: "character",
      description: "mô tả từ kết quả",
      images: [{ mediaId: "face1", view: "face" }],
      session: { accountId: "muse_vid_01", threadUrl: "https://muse.example/t/1" },
    };
    const out = (id: string): NodeOutputs | undefined => (id === "c" ? { character: real } : undefined);
    const p = scene();
    const r = promptPreview("s", nodes(p), edges, out);
    if ("note" in r) throw new Error("phải có prompt");
    const expected = keyframeStep({ shot: sceneShot(p, false), providerId: "fake", character: real, location: sets().location }).prompt;
    expect(r.sections[0]!.text).toBe(expected);
    expect(expected).toContain("chính người trong các ảnh bạn đã tạo");
  });
});

describe("promptPreview — Biên kịch và node khác", () => {
  it("Biên kịch: prompt viết kịch bản, kèm mô tả nhân vật nối vào", () => {
    const writer = node("w", "writer", { idea: "Cô gái dựng lều bên suối rồi nhóm lửa", shotCount: 8, provider: "fake" });
    const r = promptPreview("w", [writer, character], [wire("c", "character", "w", "character")], noOutput);
    expect(r).toEqual({
      sections: [{ title: "Prompt gửi Biên kịch", text: writerPrompt({ idea: "Cô gái dựng lều bên suối rồi nhóm lửa", shotCount: 8, character: "cô gái tóc đen, áo khoác xám" }) }],
    });
  });

  it("Biên kịch: ý tưởng có khoảng trắng hai đầu và thiếu số cảnh vẫn ra đúng chữ máy chủ dựng từ tham số đã qua zod (writer/run.ts)", () => {
    const raw = { idea: "  \nCô gái dựng lều bên suối rồi nhóm lửa nấu nước \n ", provider: "fake" };
    const r = promptPreview("w", [node("w", "writer", raw)], [], noOutput);
    if ("note" in r) throw new Error("phải có prompt");
    const parsed = writerParams.parse({ ...raw, shotCount: writerDefinition.defaults.shotCount });
    expect(r.sections[0]!.text).toBe(writerPrompt({ idea: parsed.idea, shotCount: parsed.shotCount }));
    expect(r.sections[0]!.text).toContain(`Số cảnh: ${writerDefinition.defaults.shotCount}`);
    expect(r.sections[0]!.text).toContain("Ý tưởng: Cô gái dựng lều bên suối rồi nhóm lửa nấu nước\n");
  });

  it("node khác (và node không có): Prompt được tạo khi chạy", () => {
    expect(promptPreview("c", [character], [], noOutput)).toEqual({ note: PROMPT_AT_RUN });
    expect(promptPreview("khong-co", [], [], noOutput)).toEqual({ note: PROMPT_AT_RUN });
  });
});
