import { describe, expect, it } from "vitest";
import type { CastMember } from "./cast";
import { parseEpisodeBatch, parseIdeas, parseOutline } from "./episode-format";

const fence = (v: unknown) => `Đây nhé:\n\`\`\`json\n${JSON.stringify(v)}\n\`\`\``;
const members: CastMember[] = [
  { name: "Mướp", look: "mèo mướp cam béo tròn", size: "cao 40 cm", trait: "" },
  { name: "gián Đỏ", look: "gián nâu đội mũ đỏ", size: "cao 7 cm", trait: "" },
];
const shot = (patch: Record<string, unknown> = {}) => ({
  id: "x",
  size: "MS",
  angle: "eye",
  move: "static",
  subject: "character",
  link: "cut",
  cast: ["Mướp"],
  start: "Mướp đứng cạnh bàn",
  motion: "Mướp nhảy lên bàn",
  end: "Mướp đứng trên bàn",
  props: "",
  ...patch,
});

describe("đọc câu trả lời phim hoạt hình", () => {
  it("ý tưởng: cần đủ 3, mỗi ý có leo thang và cú chốt", () => {
    const idea = { title: "Bánh kem", logline: "gián giành bánh kem sinh nhật", escalation: "mỗi lần hỏng to hơn", twist: "bánh úp lên đầu Mướp" };
    expect(parseIdeas(fence({ ideas: [idea, idea, idea] })).ok).toBe(true);
    const two = parseIdeas(fence({ ideas: [idea, idea] }));
    expect(two.ok === false && two.errors.join()).toMatch(/3 ý tưởng/);
  });

  it("dàn ý: 3 phần, các đợt phủ kín cảnh 1..n nối liền; hở hoặc thiếu thì báo rõ", () => {
    const beat = (from: number, to: number) => ({ from, to, what: "chuyện xảy ra", end: "bánh giữa bàn" });
    const ok = {
      title: "Tập 1",
      props: [{ name: "bánh kem", size: "to bằng nửa Mướp" }],
      parts: [
        { name: "Gây chuyện", beats: [beat(1, 2)] },
        { name: "Leo thang", beats: [beat(3, 10)] },
        { name: "Chốt", beats: [beat(11, 12)] },
      ],
    };
    expect(parseOutline(fence(ok), 12).ok).toBe(true);
    const gap = parseOutline(fence({ ...ok, parts: [ok.parts[0], { name: "Leo thang", beats: [beat(4, 10)] }, ok.parts[2]] }), 12);
    expect(gap.ok === false && gap.errors.join()).toMatch(/bắt đầu ở cảnh 4, phải là cảnh 3/);
    const short = parseOutline(fence(ok), 36);
    expect(short.ok === false && short.errors.join()).toMatch(/phủ đúng cảnh 1 đến 36/);
    const two = parseOutline(fence({ ...ok, parts: ok.parts.slice(0, 2) }), 12);
    expect(two.ok === false && two.errors.join()).toMatch(/đúng 3 phần/);
  });

  it("đợt cảnh: đánh lại mã liên tục, chuẩn hoá tên nhân vật; đồ vật mới chỉ trả món chưa khai báo", () => {
    const known = [{ name: "bánh kem", description: "bánh kem tròn to bằng nửa Mướp", states: ["nguyên vẹn"] }];
    const r = parseEpisodeBatch(
      fence({
        props: [known[0], { name: "nến", description: "cây nến đỏ cao bằng gián Đỏ", states: ["tắt", "cháy"] }],
        shots: [shot({ cast: ["mướp"] }), shot({ size: "CU", props: "nến: tắt -> cháy" })],
      }),
      { from: 13, to: 14, members, prev: [], known },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.shots.map((s) => s.id)).toEqual(["c13", "c14"]);
    expect(r.value.shots[0]?.cast).toEqual(["Mướp"]);
    expect(r.value.props.map((p) => p.name)).toEqual(["nến"]);
  });

  it("đợt cảnh: sai số cảnh, tên lạ, thiếu cuối cảnh, chỉ tay, có nhân vật mà cast rỗng → lỗi để nhờ sửa", () => {
    const bad = parseEpisodeBatch(fence({ shots: [shot({ cast: ["chuột"] }), shot({ end: "" }), shot({ subject: "hands" }), shot({ cast: [] })] }), {
      from: 1,
      to: 5,
      members,
      prev: [],
      known: [],
    });
    expect(bad.ok).toBe(false);
    const text = bad.ok ? "" : bad.errors.join("\n");
    expect(text).toMatch(/đúng 5 cảnh/);
    expect(text).toMatch(/"chuột" không có trong dàn nhân vật/);
    expect(text).toMatch(/Cảnh 2: thiếu end/);
    expect(text).toMatch(/Cảnh 3: subject chỉ được/);
    expect(text).toMatch(/Cảnh 4: có nhân vật nhưng cast rỗng/);
  });

  it("đợt cảnh: luật cả chuỗi tính cả các cảnh trước (đồ vật sai trạng thái so với cảnh trước)", () => {
    const known = [{ name: "bánh kem", description: "bánh kem tròn", states: ["nguyên vẹn", "bị cắn dở"] }];
    const prev = [{ ...shot({ props: "bánh kem: nguyên vẹn -> bị cắn dở" }), id: "c01", cast: ["Mướp"], end: "bánh bị cắn dở" }] as never;
    const r = parseEpisodeBatch(fence({ shots: [shot({ size: "CU", props: "bánh kem: nguyên vẹn" })] }), { from: 2, to: 2, members, prev, known });
    expect(r.ok === false && r.errors.join()).toMatch(/Cảnh 2: "bánh kem" đang ở trạng thái "bị cắn dở"/);
  });
});
