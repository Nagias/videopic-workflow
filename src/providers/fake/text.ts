import { WRITER_TAG } from "../../shared/prompts";

// Câu trả lời chữ giả (không tốn lượt): dùng cho test và chạy thử giao diện.
// Với yêu cầu Biên kịch: trả một kịch bản hợp lệ đúng số cảnh xin.
const SIZES = ["WS", "MS", "CU", "MCU", "INSERT"] as const;

function fakeScript(count: number): string {
  const shots = Array.from({ length: count }, (_, i) => {
    const id = `c${String(i + 1).padStart(2, "0")}`;
    if (i === 0) return { id, size: "EWS", angle: "aerial", move: "drone", subject: "none", link: "cut", start: "sườn đồi rừng buổi sáng, sương mỏng", motion: "sương trôi chậm qua tán cây", props: "" };
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

export function fakeTextReply(prompt: string): string {
  if (prompt.includes(WRITER_TAG)) return fakeScript(Number(/Số cảnh: (\d+)/.exec(prompt)?.[1] ?? 6));
  return `Trả lời giả cho: ${prompt.trim().slice(0, 60)}`;
}
