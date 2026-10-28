import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import { extractJsonBlock, parseWriterReply } from "../../shared/writer-format";
import { definition } from "./definition";
import { run } from "./run";

const good = {
  props: [{ name: "khúc gỗ", description: "khúc gỗ thông ngắn vỏ nâu", states: ["nguyên khúc", "bổ đôi"] }],
  shots: [
    { id: "c01", size: "EWS", angle: "aerial", move: "drone", subject: "none", link: "cut", start: "sườn đồi buổi sáng có sương", motion: "sương trôi chậm qua tán cây", props: "" },
    { id: "c02", size: "MS", angle: "eye", move: "handheld", subject: "character", link: "cut", start: "cô gái áo đen đứng sau gốc cây, giơ rìu", motion: "cô bổ mạnh rìu xuống, gỗ tách đôi", props: "khúc gỗ: nguyên khúc -> bổ đôi" },
  ],
};
const bad = { ...good, shots: [good.shots[0], { ...good.shots[1], subject: "none" }] };
const fenced = (v: unknown) => `Đây là kịch bản của bạn:\n\`\`\`json\n${JSON.stringify(v, null, 2)}\n\`\`\`\nChúc bạn quay vui!`;
const idea = "Một cô gái sinh tồn trong rừng Sơn La, bổ củi và nhóm lửa bên suối";

describe("node writer (Biên kịch)", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it("đọc khối JSON trong câu trả lời có lời dẫn → ra danh sách cảnh và danh sách đồ vật", async () => {
    const counter = countingFakeProviders({ textReply: () => fenced(good) });
    const out = await run(testNodeCtx(env, counter.providers), {}, definition.params.parse({ idea, shotCount: 8, provider: "fake" }));
    expect(out.shots?.kind === "shotlist" && out.shots.shots.map((s) => s.id)).toEqual(["c01", "c02"]);
    expect(out.props?.kind === "propspec" && out.props.items[0]?.states).toEqual(["nguyên khúc", "bổ đôi"]);
    expect(counter.log.text).toBe(1);
    expect(counter.log.textPrompts[0]).toContain(idea);
    expect(counter.log.textPrompts[0]).toContain("Số cảnh: 8");
  });

  it("JSON sai luật lần 1 → gửi lỗi sửa trong cùng chat → lần 2 đúng", async () => {
    const counter = countingFakeProviders({ textReply: (_p, n) => fenced(n === 1 ? bad : good) });
    const out = await run(testNodeCtx(env, counter.providers), {}, definition.params.parse({ idea, shotCount: 8, provider: "fake" }));
    expect(out.shots?.kind).toBe("shotlist");
    expect(counter.log.textSessions).toEqual(["new", "continue"]);
    expect(counter.log.textPrompts[1]).toMatch(/không có người tác động/);
  });

  it("đồ vật trùng tên trong kịch bản → nhờ sửa trong cùng chat (không để node Đồ vật báo lỗi sau)", async () => {
    const dup = { ...good, props: [good.props[0], good.props[0]] };
    const counter = countingFakeProviders({ textReply: (_p, n) => fenced(n === 1 ? dup : good) });
    await run(testNodeCtx(env, counter.providers), {}, definition.params.parse({ idea, shotCount: 8, provider: "fake" }));
    expect(counter.log.textSessions).toEqual(["new", "continue"]);
    expect(counter.log.textPrompts[1]).toMatch(/trùng tên "khúc gỗ"/);
  });

  it("sai 3 lần → lỗi rõ kèm lỗi cuối, không lặp thêm", async () => {
    const counter = countingFakeProviders({ textReply: () => "Xin lỗi, mình chưa viết được." });
    await expect(run(testNodeCtx(env, counter.providers), {}, definition.params.parse({ idea, shotCount: 8, provider: "fake" }))).rejects.toThrow(
      /Biên kịch chưa ra danh sách cảnh hợp lệ sau 3 lần.*không tìm thấy khối JSON/,
    );
    expect(counter.log.text).toBe(3);
  });

  it("nối Nhân vật và Không gian thì prompt có mô tả của cả hai", async () => {
    const counter = countingFakeProviders({ textReply: () => fenced(good) });
    const inputs = {
      character: { kind: "imageset" as const, role: "character" as const, description: "cô gái áo thể thao màu than", images: [] },
      location: { kind: "imageset" as const, role: "location" as const, description: "sườn đồi có suối đá", images: [] },
    };
    await run(testNodeCtx(env, counter.providers), inputs, definition.params.parse({ idea, shotCount: 6, provider: "fake" }));
    expect(counter.log.textPrompts[0]).toContain("cô gái áo thể thao màu than");
    expect(counter.log.textPrompts[0]).toContain("sườn đồi có suối đá");
  });

  it("dịch vụ giả mặc định trả kịch bản hợp lệ (dùng cho chạy thử giao diện)", async () => {
    const counter = countingFakeProviders();
    const out = await run(testNodeCtx(env, counter.providers), {}, definition.params.parse({ idea, shotCount: 6, provider: "fake" }));
    expect(out.shots?.kind === "shotlist" && out.shots.shots.length).toBe(6);
  });

  it("đọc JSON: lấy khối ```json cuối cùng; không có khối thì lấy từ { đầu đến } cuối; rác thì báo lỗi", () => {
    expect(extractJsonBlock('a ```json\n{"x":1}\n``` b ```json\n{"x":2}\n```')).toEqual({ x: 2 });
    expect(extractJsonBlock('trả lời {"x":3} hết')).toEqual({ x: 3 });
    expect(() => extractJsonBlock("không có gì")).toThrow(/không tìm thấy khối JSON/);
    const parsed = parseWriterReply(fenced({ props: [], shots: [{ ...good.shots[0], id: undefined }] }));
    expect(parsed.ok && parsed.value.shots[0]?.id).toBe("c01");
  });

  it("ý tưởng quá ngắn, số cảnh ngoài 4–24 bị chặn", () => {
    expect(definition.params.safeParse({ idea: "rừng", shotCount: 8, provider: "fake" }).success).toBe(false);
    expect(definition.params.safeParse({ idea, shotCount: 30, provider: "fake" }).success).toBe(false);
  });
});
