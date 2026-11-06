import { describe, expect, it } from "vitest";
import * as cartoon from "./cartoon-prompts";
import type { CastMember } from "./cast";
import type { Shot } from "./director";

const members: CastMember[] = [
  { name: "Mướp", look: "mèo mướp cam béo tròn, mắt xanh lá", size: "cao 40 cm", trait: "lười" },
  { name: "gián Đỏ", look: "gián nâu đội mũ lưỡi trai đỏ", size: "cao 7 cm, chỉ tới đầu gối Mướp", trait: "lanh lợi" },
  { name: "gián Xanh", look: "gián nâu quàng khăn xanh", size: "cao 7 cm", trait: "nhát" },
];

const shot = (patch: Partial<Shot>): Shot => ({
  id: "c02",
  size: "WS",
  angle: "eye",
  move: "static",
  subject: "character",
  link: "cut",
  start: "gián Đỏ đứng cạnh chân bàn",
  motion: "gián Đỏ nhảy lên bàn",
  props: "",
  ...patch,
});

const REAL_ONLY = /Ảnh chụp bằng điện thoại|ảnh chụp thật|lỗ chân lông|Chuyển động thật, có lực, đúng vật lý/;

describe("prompt phim hoạt hình", () => {
  it("mọi hàm xuất ra đều nằm trong CARTOON_FUNCTIONS (sửa prompt là CARTOON_VERSION đổi)", () => {
    const exported = Object.entries(cartoon as Record<string, unknown>).filter(([, v]) => typeof v === "function");
    const listed = new Set<unknown>(cartoon.CARTOON_FUNCTIONS);
    expect(exported.filter(([, f]) => !listed.has(f)).map(([name]) => name)).toEqual([]);
    expect(cartoon.CARTOON_VERSION).toMatch(/^[0-9a-z]+\.[0-9a-z]+$/);
  });

  it("ảnh cả dàn: đúng tỉ lệ kích thước, có vạch đo chiều cao; từng nhân vật nối tiếp trong chat; không câu chữ người thật", () => {
    const sheet = cartoon.CAST_SHEET(members, "hoat-hinh-2d");
    expect(sheet.map((v) => v.view)).toEqual(["front", "member-1", "member-2", "member-3"]);
    expect(sheet[0]!.prompt).toMatch(/đúng tỉ lệ kích thước/);
    expect(sheet[0]!.prompt).toMatch(/gián Đỏ cao 7 cm, chỉ tới đầu gối Mướp/);
    expect(sheet[0]!.prompt).toMatch(/vạch đo chiều cao/);
    expect(sheet[1]!.inChatPrompt).toMatch(/chỉ riêng Mướp trong ảnh bạn vừa tạo/);
    expect(sheet.every((v) => /hoạt hình 2D/.test(v.prompt) && !REAL_ONLY.test(v.prompt))).toBe(true);
  });

  it("ảnh khung: chỉ những ai có tên trong cast, nói rõ ai vắng mặt, nhắc tỉ lệ; cảnh không nhân vật nói rõ không có ai", () => {
    const ctx = { members, look: cartoon.cartoonLook("hoat-hinh-2d", "buổi tối"), location: "căn bếp", props: [], refs: ["cả dàn", "gián Đỏ", "bối cảnh"] };
    const p = cartoon.cartoonKeyframePrompt(shot({ cast: ["gián Đỏ"] }), ctx);
    expect(p).toMatch(/Trong khung chỉ có: gián Đỏ/);
    expect(p).toMatch(/Không có trong khung: Mướp, gián Xanh/);
    expect(p).toMatch(/Tỉ lệ kích thước/);
    expect(p).toMatch(/ảnh 1: cả dàn; ảnh 2: gián Đỏ; ảnh 3: bối cảnh/);
    expect(p).toMatch(/buổi tối/);
    expect(REAL_ONLY.test(p)).toBe(false);
    expect(cartoon.cartoonKeyframePrompt(shot({ subject: "none", cast: [] }), ctx)).toMatch(/Không có nhân vật nào trong khung/);
  });

  it("video: luật diễn xuất hoạt hình (cường điệu, không lời thoại), cuối cảnh, không thêm nhân vật; không luật vật lý đời thật", () => {
    const p = cartoon.cartoonMotionPrompt(shot({ cast: ["gián Đỏ", "Mướp"], end: "gián Đỏ đứng trên bánh, Mướp ngã dưới sàn" }), { members });
    expect(p).toMatch(/cường điệu/);
    expect(p).toMatch(/không nói thành lời/);
    expect(p).toMatch(/Cuối 5 giây: gián Đỏ đứng trên bánh, Mướp ngã dưới sàn/);
    expect(p).toMatch(/Nhân vật trong cảnh: gián Đỏ \(cao 7 cm, chỉ tới đầu gối Mướp\); Mướp \(cao 40 cm\); không thêm nhân vật khác/);
    expect(REAL_ONLY.test(p)).toBe(false);
  });

  it("ai trong khung: tên không phân biệt hoa thường; tên lạ báo riêng; cảnh viết tay không có cast thì cả dàn", () => {
    const r = cartoon.castInShot({ subject: "character", cast: ["GIÁN ĐỎ", "chuột"] }, members);
    expect(r.present.map((m) => m.name)).toEqual(["gián Đỏ"]);
    expect(r.unknown).toEqual(["chuột"]);
    expect(cartoon.castInShot({ subject: "character" }, members).present).toHaveLength(3);
  });

  it("ý tưởng, dàn ý, đợt cảnh: có kiến thức đạo diễn hài không lời, dàn nhân vật, luật loạt phim, đúng số cảnh", () => {
    const ctx = { members, rules: "Gián luôn thắng.", location: "căn bếp" };
    expect(cartoon.ideasPrompt({ ...ctx, hint: "" })).toMatch(/Luật ba lần/);
    expect(cartoon.ideasPrompt({ ...ctx, hint: "" })).toContain(cartoon.IDEAS_TAG);
    const outline = cartoon.outlinePrompt({ ...ctx, idea: "tranh bánh kem", shotCount: 36 });
    expect(outline).toMatch(/đúng 36 cảnh/);
    expect(outline).toMatch(/khoảng 3 phút/);
    const first = cartoon.episodeWriterPrompt({ ...ctx, story: "Phần 1 …", shotCount: 36 }, 1, 12);
    expect(first).toMatch(/Đợt này: cảnh 1 đến 12/);
    expect(first).toMatch(/"Mướp", "gián Đỏ", "gián Xanh"/);
    expect(first).toMatch(/Luật của loạt phim: Gián luôn thắng/);
    expect(cartoon.episodeContinuePrompt(13, 24, "Mướp ngã dưới sàn", members)).toMatch(/Cuối cảnh 12 .*Mướp ngã dưới sàn/);
  });
});
