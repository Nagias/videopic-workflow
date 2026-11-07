import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testCastSet } from "../../../tests/helpers/cartoon";
import { countingFakeProviders, testNodeCtx } from "../../../tests/helpers/nodes";
import { createTestEnv, type TestEnv } from "../../../tests/helpers/test-env";
import type { PortValue } from "../../shared/ports";
import { writerPrompt } from "../../shared/prompts";
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

  it("số cảnh ngoài 4–36 bị chặn; ý tưởng quá ngắn (không có Dàn ý) bị chặn, không gọi dịch vụ", async () => {
    expect(definition.params.safeParse({ idea, shotCount: 3, provider: "fake" }).success).toBe(false);
    expect(definition.params.safeParse({ idea, shotCount: 36, provider: "fake" }).success).toBe(true);
    expect(definition.params.safeParse({ idea, shotCount: 37, provider: "fake" }).success).toBe(false);
    const counter = countingFakeProviders();
    await expect(run(testNodeCtx(env, counter.providers), {}, { idea: "rừng", shotCount: 8, provider: "fake" })).rejects.toThrow(/Ý tưởng quá ngắn/);
    expect(counter.log.text).toBe(0);
  });
});

describe("node writer (Biên kịch) — phim hoạt hình", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const outline = { kind: "outline" as const, title: "Bánh kem", text: "Phần 1 · Gây chuyện\n- Cảnh 1–5: …", shotCount: 30 };

  it("nối Dàn nhân vật + Dàn ý: viết 3 đợt (12, 12, 6 cảnh) trong cùng chat, mỗi cảnh có ai trong khung và cuối cảnh; đồ vật mang phong cách", async () => {
    const counter = countingFakeProviders();
    const ctx = testNodeCtx(env, counter.providers);
    const out = await run(ctx, { character: testCastSet(), outline }, { idea: "", shotCount: 12, provider: "fake" });
    expect(counter.log.text).toBe(3);
    expect(counter.log.textSessions).toEqual(["new", "continue", "continue"]);
    expect(counter.log.textPrompts[0]).toMatch(/Đợt này: cảnh 1 đến 12/);
    expect(counter.log.textPrompts[0]).toMatch(/Phần 1 · Gây chuyện/);
    expect(counter.log.textPrompts[1]).toMatch(/Đợt này: cảnh 13 đến 24/);
    expect(counter.log.textPrompts[1]).toMatch(/Cuối cảnh 12/);
    expect(counter.log.textPrompts[2]).toMatch(/Đợt này: cảnh 25 đến 30/);
    const shots = out.shots?.kind === "shotlist" ? out.shots.shots : [];
    expect(shots.map((s) => s.id)).toEqual(Array.from({ length: 30 }, (_, i) => `c${String(i + 1).padStart(2, "0")}`));
    expect(shots.every((s) => Array.isArray(s.cast) && typeof s.end === "string" && s.end.length > 0)).toBe(true);
    expect(out.props?.kind === "propspec" && out.props.style).toBe("hoat-hinh-2d");
    expect(out.props?.kind === "propspec" && out.props.items.map((p) => p.name)).toEqual(["bánh kem"]);
    // Chạy lại: mọi đợt có cache, không hỏi lại.
    await run(ctx, { character: testCastSet(), outline }, { idea: "", shotCount: 12, provider: "fake" });
    expect(counter.log.text).toBe(3);
  });

  it("đợt 2 sai (tên nhân vật lạ) → nhờ sửa đợt đó trong cùng chat; đợt 1 không viết lại", async () => {
    let calls = 0;
    const counter = countingFakeProviders({
      textReply: (prompt) => {
        calls++;
        const m = /Đợt này: cảnh (\d+) đến (\d+)/.exec(prompt) ?? /Đợt cảnh (\d+) đến (\d+) vừa rồi/.exec(prompt);
        const from = Number(m?.[1]);
        const to = Number(m?.[2]);
        const who = calls === 2 ? "chuột" : "Mướp";
        const shots = Array.from({ length: to - from + 1 }, (_, i) => ({
          id: "x",
          size: i % 2 ? "MS" : "CU",
          angle: "eye",
          move: "static",
          subject: "character",
          link: "cut",
          cast: [who],
          start: "Mướp đứng cạnh bàn",
          motion: "Mướp nhảy",
          end: "Mướp trên bàn",
          props: "",
        }));
        return `\`\`\`json\n${JSON.stringify({ props: [], shots })}\n\`\`\``;
      },
    });
    const out = await run(testNodeCtx(env, counter.providers), { character: testCastSet(), outline: { ...outline, shotCount: 24 } }, { idea: "", shotCount: 12, provider: "fake" });
    expect(counter.log.text).toBe(3);
    expect(counter.log.textPrompts[2]).toMatch(/Đợt cảnh 13 đến 24 vừa rồi chưa dùng được/);
    expect(counter.log.textPrompts[2]).toMatch(/"chuột" không có trong dàn nhân vật/);
    expect(out.shots?.kind === "shotlist" && out.shots.shots).toHaveLength(24);
  });

  it("Dàn ý nối vào Biên kịch mà Nhân vật là người thật → lỗi rõ, không gọi dịch vụ", async () => {
    const counter = countingFakeProviders();
    const real = { kind: "imageset" as const, role: "character" as const, description: "cô gái", images: [] };
    await expect(run(testNodeCtx(env, counter.providers), { character: real, outline }, { idea: "", shotCount: 12, provider: "fake" })).rejects.toThrow(/phim hoạt hình/);
    expect(counter.log.text).toBe(0);
  });

  it("ước tính: nối Dàn ý chưa biết → theo 36 cảnh (3 đợt × 3 lượt); biết dàn ý 30 cảnh → 3 đợt; người thật → 3 lượt", () => {
    expect(definition.estimate?.({ idea, shotCount: 12, provider: "fake" }, new Set(["outline"]))).toEqual({ image: 0, video: 0, text: 9 });
    const known = { inputs: { outline }, step: () => undefined, media: () => undefined };
    expect(definition.estimate?.({ idea, shotCount: 12, provider: "fake" }, new Set(["outline"]), known)).toEqual({ image: 0, video: 0, text: 9 });
    expect(definition.estimate?.({ idea, shotCount: 12, provider: "fake" }, new Set())).toEqual({ image: 0, video: 0, text: 3 });
  });
});

describe("node writer (Biên kịch) — sản phẩm ảnh thật", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const product: PortValue = {
    kind: "props",
    items: [
      {
        name: "Bàn gấp",
        description: "bàn dã ngoại gấp gọn mặt nhôm xám",
        images: [
          { mediaId: "m1", state: "gấp phẳng" },
          { mediaId: "m2", state: "gấp phẳng" },
          { mediaId: "m3", state: "có chân" },
        ],
      },
    ],
  };
  const withProduct = (props: string, extra: unknown[] = []) => ({
    props: extra,
    shots: [good.shots[0], { ...good.shots[1], start: "cô gái áo đen ngồi trên ván chèo, bàn gấp đặt trước mặt", motion: "cô lắp chân bàn", props }],
  });
  const params = () => definition.params.parse({ idea: "Cô gái giới thiệu bàn dã ngoại trên hồ", shotCount: 6, provider: "fake" });

  it("không nối sản phẩm → prompt y hệt writerPrompt cũ", async () => {
    const counter = countingFakeProviders({ textReply: () => fenced(good) });
    await run(testNodeCtx(env, counter.providers), {}, params());
    expect(counter.log.textPrompts[0]).toBe(writerPrompt({ idea: "Cô gái giới thiệu bàn dã ngoại trên hồ", shotCount: 6 }));
  });

  it("có sản phẩm → prompt liệt kê tên, mô tả, trạng thái (bỏ trùng); kịch bản dùng đúng trạng thái → xong, cổng ra props chỉ có đồ phụ", async () => {
    const extra = [{ name: "bình nước", description: "bình giữ nhiệt inox", states: ["đầy"] }];
    const counter = countingFakeProviders({ textReply: () => fenced(withProduct("Bàn gấp: gấp phẳng -> có chân", extra)) });
    const out = await run(testNodeCtx(env, counter.providers), { product }, params());
    const prompt = counter.log.textPrompts[0]!;
    expect(prompt).toContain("Sản phẩm chính (đã có ảnh thật");
    expect(prompt).toContain("Bàn gấp — bàn dã ngoại gấp gọn mặt nhôm xám — trạng thái: gấp phẳng, có chân");
    expect(counter.log.text).toBe(1);
    expect(out.props?.kind === "propspec" && out.props.items.map((i) => i.name)).toEqual(["bình nước"]);
  });

  it("dùng trạng thái sản phẩm không có ảnh → nhờ sửa trong cùng chat, lần 2 đúng → xong", async () => {
    const counter = countingFakeProviders({ textReply: (_p, n) => fenced(withProduct(n === 1 ? "Bàn gấp: gập đôi" : "Bàn gấp: có chân")) });
    await run(testNodeCtx(env, counter.providers), { product }, params());
    expect(counter.log.text).toBe(2);
    expect(counter.log.textPrompts[1]).toContain("gập đôi");
    expect(counter.log.textSessions[1]).toBe("continue");
  });

  it("khai báo lại sản phẩm trong props → lỗi rõ", () => {
    const reply = fenced(withProduct("Bàn gấp: có chân", [{ name: "bàn gấp", description: "bàn khác do biên kịch nghĩ", states: ["có chân"] }]));
    const r = parseWriterReply(reply, [{ name: "Bàn gấp", states: ["gấp phẳng", "có chân"] }]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors).toContain('Đồ vật "bàn gấp" là sản phẩm đã có ảnh thật, không được khai báo lại trong "props"');
  });

  it("kịch bản không nhắc sản phẩm vẫn hợp lệ (không có luật số cảnh có sản phẩm)", () => {
    expect(parseWriterReply(fenced(good), [{ name: "Bàn gấp", states: ["gấp phẳng"] }]).ok).toBe(true);
  });
});
