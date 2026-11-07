import { IDEAS_TAG, OUTLINE_TAG } from "../../shared/cartoon-prompts";
import { WRITER_TAG } from "../../shared/prompts";

// Câu trả lời chữ giả (không tốn lượt): dùng cho test và chạy thử giao diện.
// Với yêu cầu Biên kịch: trả một kịch bản hợp lệ đúng số cảnh xin. Phim hoạt hình: ý tưởng, dàn ý, từng đợt cảnh hợp lệ.
const SIZES = ["WS", "MS", "CU", "MCU", "INSERT"] as const;

function fakeScript(count: number): string {
  const shots = Array.from({ length: count }, (_, i) => {
    const id = `c${String(i + 1).padStart(2, "0")}`;
    if (i === 0)
      return {
        id,
        size: "EWS",
        angle: "aerial",
        move: "drone",
        subject: "none",
        link: "cut",
        start: "sườn đồi rừng buổi sáng, sương mỏng",
        motion: "sương trôi chậm qua tán cây",
        props: "",
      };
    const chop = i === 1;
    return {
      id,
      size: SIZES[i % SIZES.length],
      angle: i % 2 ? "eye" : "low",
      move: "handheld",
      subject: i % 3 === 2 ? "none" : "character",
      link: "cut",
      start: chop ? "cô gái áo đen đứng sau gốc cây, hai tay giơ rìu, khúc gỗ dựng trên gốc cây" : `khung đầu cảnh ${i + 1}`,
      motion: chop ? "cô bổ mạnh rìu xuống, khúc gỗ tách đôi đổ sang hai bên" : `việc xảy ra ở cảnh ${i + 1}`,
      props: chop ? "khúc gỗ: nguyên khúc -> bổ đôi" : "",
    };
  });
  const script = { props: [{ name: "khúc gỗ", description: "khúc gỗ thông ngắn dài 40 cm, vỏ nâu sẫm", states: ["nguyên khúc", "bổ đôi"] }], shots };
  return `Đây là kịch bản:\n\`\`\`json\n${JSON.stringify(script, null, 2)}\n\`\`\``;
}

const fence = (v: unknown) => `\`\`\`json\n${JSON.stringify(v, null, 2)}\n\`\`\``;

function fakeIdeas(): string {
  const idea = (k: number) => ({
    title: `Ý tưởng giả ${k}`,
    logline: `Hai phe tranh nhau món đồ số ${k} trong bối cảnh`,
    escalation: "mỗi lần giành lại thì hỏng to hơn",
    twist: "món đồ rơi trúng kẻ thắng cuộc",
  });
  return `Đây là 3 ý tưởng:\n${fence({ ideas: [idea(1), idea(2), idea(3)] })}`;
}

function fakeOutline(n: number): string {
  const a = Math.max(1, Math.round(n * 0.15));
  const c = Math.max(a + 2, n - Math.round(n * 0.15));
  const mid = Math.floor((a + 1 + c - 1) / 2);
  const beat = (from: number, to: number, what: string) => ({ from, to, what, end: `cuối đợt ${from}–${to}: món đồ vẫn trên bàn, to bằng nửa nhân vật lớn` });
  return fence({
    title: "Tập giả",
    props: [{ name: "bánh kem", size: "to bằng nửa nhân vật lớn" }],
    parts: [
      { name: "Gây chuyện", beats: [beat(1, a, "giới thiệu bối cảnh và món đồ")] },
      { name: "Leo thang", beats: [beat(a + 1, mid, "đợt giành thứ nhất"), beat(mid + 1, c, "đợt giành thứ hai to hơn")] },
      { name: "Chốt", beats: [beat(c + 1, n, "cú lật bất ngờ")] },
    ],
  });
}

// Tên nhân vật hợp lệ: các chuỗi trong ngoặc kép ở dòng nói về cast (lời đầu và lời đợt sau đều có).
function castNames(prompt: string): string[] {
  const line = prompt.split("\n").find((l) => /cast/.test(l) && /"[^"]+"/.test(l)) ?? "";
  return [...line.matchAll(/"([^"…]+)"/g)].map((m) => m[1]!).filter((x) => x !== "none" && x !== "character");
}

function fakeEpisodeBatch(from: number, to: number, names: string[]): string {
  const shots = Array.from({ length: to - from + 1 }, (_, i) => {
    const n = from + i;
    const id = `c${String(n).padStart(2, "0")}`;
    const who = names.length ? [names[n % names.length]!] : [];
    if (n === 1 || who.length === 0) {
      return {
        id,
        size: "WS",
        angle: "high",
        move: "push_in",
        subject: "none",
        link: "cut",
        cast: [],
        start: "toàn cảnh bối cảnh, bánh kem giữa bàn",
        motion: "máy tiến chậm về phía bánh kem",
        end: "bánh kem giữa bàn",
        props: "",
      };
    }
    return {
      id,
      size: SIZES[n % SIZES.length],
      angle: n % 2 ? "eye" : "low",
      move: "static",
      subject: "character",
      link: "cut",
      cast: who,
      start: `${who[0]} đứng cạnh bàn, bánh kem giữa bàn`,
      motion: `${who[0]} nhảy lên giành bánh rồi trượt ngã`,
      end: `${who[0]} nằm dưới sàn, bánh kem vẫn giữa bàn`,
      props: n === 2 ? "bánh kem: nguyên vẹn" : "",
    };
  });
  const props =
    from === 1 ? [{ name: "bánh kem", description: "bánh kem tròn trắng có dâu, to bằng nửa nhân vật lớn", states: ["nguyên vẹn", "bị cắn dở"] }] : [];
  return `Đợt cảnh ${from}–${to}:\n${fence({ props, shots })}`;
}

export function fakeTextReply(prompt: string): string {
  if (prompt.includes(IDEAS_TAG)) return fakeIdeas();
  if (prompt.includes(OUTLINE_TAG)) return fakeOutline(Number(/đúng (\d+) cảnh/.exec(prompt)?.[1] ?? 12));
  const batch = /Đợt này: cảnh (\d+) đến (\d+)/.exec(prompt) ?? /Đợt cảnh (\d+) đến (\d+) vừa rồi/.exec(prompt);
  if (batch) return fakeEpisodeBatch(Number(batch[1]), Number(batch[2]), castNames(prompt));
  if (prompt.includes(WRITER_TAG)) return fakeScript(Number(/Số cảnh: (\d+)/.exec(prompt)?.[1] ?? 6));
  return `Trả lời giả cho: ${prompt.trim().slice(0, 60)}`;
}
