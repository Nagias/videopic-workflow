import { CAMERA_ANGLES, CAMERA_MOVES, parsePropLines, SHOT_SIZES, type Shot } from "./director";
import type { PropSpecItem } from "./ports";

// Mọi prompt gửi Muse của luồng phim nằm ở đây (gửi nguyên văn, tiếng Việt).
// Đo thật 28/10/2026 (TASKS.md): giọng "ảnh điện thoại, trời âm u, bối cảnh đơn giản" bớt nhựa rõ;
// prompt video chỉ tả việc xảy ra SAU khung đầu thì hết lỗi vật lý. Cấm "cinematic", "photorealistic", "2K".
// Cách chia khung đầu / chuyển động học từ ViMax (MIT), bộ ảnh mẫu học từ Toonflow (MIT) — xem NOTICE.md.

export const DEFAULT_LOOK = "Ảnh chụp bằng điện thoại như khung hình vlog, ánh sáng tự nhiên, trời hơi âm u, màu tự nhiên không chỉnh màu";

const VIDEO_RULES =
  "Chuyển động thật, có lực, đúng vật lý; chỉ làm đúng việc đã tả, không làm thêm bước tiếp theo; không nhìn vào máy quay, không thêm người, không cắt cảnh, không chữ, khung ngang 16:9.";
const STILL_RULES = "Bối cảnh đơn giản, không chữ, không logo, khung ngang 16:9.";

export type ReferenceView = { view: string; label: string; prompt: string; inChatPrompt?: string };

export type KeyframeCtx = {
  look: string;
  location: string;
  props: { name: string; state: string; description: string }[];
  refs: string[];
  inChat: boolean;
  character?: string;
};

const framing = (shot: Shot) => `Khung hình: ${SHOT_SIZES[shot.size].vi}, ${CAMERA_ANGLES[shot.angle].vi}.`;

function who(shot: Shot, c: KeyframeCtx): string {
  if (shot.subject === "none") return "Tạo 1 ảnh khung ngang 16:9, không có người trong khung.";
  const person = c.inChat
    ? "chính người trong các ảnh bạn đã tạo ở trên trong đoạn chat này (giữ nguyên mặt, tóc, vóc dáng, quần áo)"
    : `${c.character ?? "nhân vật"} (giữ đúng người trong ảnh đính kèm)`;
  // Khung chỉ có tay thì Muse không thấy quần áo → tự vẽ tay áo; ghi rõ trang phục (đo 28/10/2026).
  const outfit = c.character ? ` (đúng trang phục: ${c.character})` : "";
  const hands = shot.subject === "hands" ? ` Chỉ thấy bàn tay và cẳng tay của người đó${outfit}, không thấy mặt.` : "";
  return `Tạo 1 ảnh khung ngang 16:9, khung hình tiếp theo của cùng câu chuyện: ${person}.${hands}`;
}

export function keyframePrompt(shot: Shot, c: KeyframeCtx): string {
  const refs = c.refs.length ? `Ảnh đính kèm theo thứ tự: ${c.refs.map((r, i) => `ảnh ${i + 1}: ${r}`).join("; ")}.` : "";
  const props = c.props.length
    ? `Đồ vật trong khung, giống hệt ảnh mẫu: ${c.props.map((p) => `${p.name} (${p.state}) — ${p.description}`).join("; ")}.`
    : "";
  return [
    who(shot, c),
    refs,
    framing(shot),
    `Lúc này: ${shot.start.trim()}.`,
    props,
    `Bối cảnh: ${c.location}, giữ đúng như ảnh bối cảnh.`,
    "Đây là ảnh đứng yên của khoảnh khắc bắt đầu, chưa có hành động nào diễn ra.",
    `${c.look}. ${STILL_RULES}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function endStates(shot: Shot): string {
  const changed = parsePropLines(shot.props).items.filter((p) => p.to && p.to.toLowerCase() !== p.from.toLowerCase());
  return changed.length ? `Cuối cảnh: ${changed.map((p) => `${p.name} ${p.to}`).join(", ")}.` : "";
}

export function motionPrompt(shot: Shot): string {
  return [
    "Tạo video 5 giây từ ảnh đính kèm, giữ nguyên người, đồ vật và bối cảnh trong ảnh.",
    `Việc xảy ra sau khung hình này: ${shot.motion.trim()}.`,
    endStates(shot),
    `Máy quay: ${CAMERA_MOVES[shot.move].vi}.`,
    VIDEO_RULES,
  ]
    .filter(Boolean)
    .join(" ");
}

export function textVideoPrompt(shot: Shot, c: { look: string; location: string }): string {
  return [
    `Tạo video 5 giây: ${shot.start.trim()}. ${shot.motion.trim()}.`,
    `${framing(shot)} Máy quay: ${CAMERA_MOVES[shot.move].vi}.`,
    `Bối cảnh: ${c.location}.`,
    `${c.look}. Không có người trong khung.`,
    VIDEO_RULES,
  ].join(" ");
}

const SHEET_BG = "Nền tường xi măng xám trơn ngoài trời, ánh sáng ban ngày dịu và đều";
const SAME_PERSON = (d: string) => `chính người trong ảnh bạn vừa tạo ở trên (giữ nguyên mặt, tóc, vóc dáng, quần áo: ${d})`;
const ATTACHED_PERSON = (d: string) => `chính người trong ảnh đính kèm (giữ nguyên mặt, tóc, vóc dáng, quần áo: ${d})`;

export function CHARACTER_SHEET(d: string, look: string): ReferenceView[] {
  const body = (pose: string) => ({
    prompt: `Tạo 1 ảnh khung ngang 16:9: ${ATTACHED_PERSON(d)}, ${pose}, thấy trọn từ đầu đến chân. ${SHEET_BG}. ${look}. Không chữ.`,
    inChatPrompt: `Ảnh tiếp theo, khung ngang 16:9: ${SAME_PERSON(d)}, ${pose}, thấy trọn từ đầu đến chân, cùng nền như ảnh trước. ${look}. Không chữ.`,
  });
  return [
    {
      view: "face",
      label: "mặt cận",
      prompt: `Tạo 1 ảnh khung ngang 16:9: ảnh chân dung cận mặt, nhìn thẳng vào máy, của ${d}. ${SHEET_BG}. ${look}. Da thật có lỗ chân lông, không trang điểm đậm, không chữ.`,
    },
    { view: "front", label: "toàn thân chính diện", ...body("đứng thẳng quay mặt về phía máy") },
    { view: "side", label: "toàn thân nghiêng", ...body("đứng quay nghiêng sang trái") },
    { view: "back", label: "toàn thân sau lưng", ...body("đứng quay lưng về phía máy") },
  ];
}

export function LOCATION_SHEET(d: string, look: string): ReferenceView[] {
  return [
    { view: "wide", label: "toàn cảnh", prompt: `Tạo 1 ảnh khung ngang 16:9, không có người: toàn cảnh ${d}. ${look}. Không chữ.` },
    {
      view: "close",
      label: "cận khu chính",
      prompt: `Tạo 1 ảnh khung ngang 16:9, không có người: cùng nơi trong ảnh đính kèm, nhìn gần hơn vào khu vực chính: ${d}. ${look}. Không chữ.`,
      inChatPrompt: `Ảnh tiếp theo, khung ngang 16:9, không có người: cùng nơi trong ảnh bạn vừa tạo, nhìn gần hơn vào khu vực chính, giữ nguyên địa hình, cây cối, ánh sáng. ${look}. Không chữ.`,
    },
  ];
}

export function propStillPrompt(item: PropSpecItem, look: string): string {
  return `Tạo 1 ảnh khung ngang 16:9: ảnh chụp thật một ${item.name}: ${item.description}, ở trạng thái ${item.states[0] ?? ""}. Chụp trọn món đồ, nằm trên mặt đất thật có bóng đổ tự nhiên, nền đơn giản, không có người, không có tay người. ${look}. Không chữ.`;
}

export function propStatePrompt(item: PropSpecItem, state: string, look: string, attached = false): string {
  const where = attached ? "trong ảnh đính kèm" : "trong ảnh bạn vừa tạo";
  return `Ảnh tiếp theo, khung ngang 16:9: chính ${item.name} ${where}, cùng góc chụp và nền, nay ở trạng thái: ${state}. Không có người, không có tay người. ${look}. Không chữ.`;
}

// Biên kịch: luật chia cảnh học từ ViMax (khung đầu là ảnh đứng yên, chuyển động chỉ là việc xảy ra sau đó,
// gọi nhân vật bằng đặc điểm nhìn thấy, cảnh đầu rộng nhất) + luật đồ vật/trạng thái của dự án.
export const WRITER_TAG = "KỊCH BẢN JSON";

export function writerPrompt(w: { idea: string; shotCount: number; character?: string; location?: string }): string {
  return [
    `Bạn là đạo diễn kiêm biên kịch phim ngắn làm bằng AI. Hãy viết ${WRITER_TAG} cho ý tưởng dưới đây.`,
    `Ý tưởng: ${w.idea.trim()}`,
    w.character ? `Nhân vật chính (đã có ảnh mẫu, giữ nguyên): ${w.character}` : "",
    w.location ? `Bối cảnh (đã có ảnh mẫu, giữ nguyên): ${w.location}` : "",
    `Số cảnh: ${w.shotCount} (mỗi cảnh 5 giây).`,
    "Luật:",
    "1. Cảnh 1 là cảnh rộng nhất giới thiệu bối cảnh (size EWS hoặc WS).",
    "2. start = khung đầu, là ẢNH ĐỨNG YÊN: ai ở đâu trong khung, quay mặt hướng nào, đồ vật nằm đâu; không có hành động đang diễn ra.",
    "3. motion = việc xảy ra trong 5 giây SAU khung đầu: một động tác chính, có lực và có hệ quả nhìn thấy được; gọi nhân vật bằng đặc điểm nhìn thấy (quần áo, tóc), không dùng tên; không tả lại khung đầu.",
    '4. "props" liệt kê mọi đồ vật quan trọng (cả đồ cố định như lều, bếp đá) với mô tả cụ thể (chất liệu, màu, cỡ) và các trạng thái; trạng thái đầu là trạng thái gốc.',
    '5. Trường props của mỗi cảnh ghi đồ vật trong khung, mỗi dòng "tên: trạng thái đầu -> trạng thái cuối" hoặc "tên: trạng thái"; tối đa 2 món mỗi cảnh; tên và trạng thái phải đúng như trong "props".',
    "6. Đồ vật xuất hiện lại phải đúng trạng thái cuối lần trước. Đồ vật đổi trạng thái thì trong khung phải có người tác động (subject character hoặc hands).",
    '7. subject: "character" (thấy nhân vật), "hands" (chỉ thấy tay nhân vật), "none" (không người: thiên nhiên, chi tiết, B-roll).',
    '8. link: "cut" (cắt cảnh) hoặc "chain" (nối tiếp: lấy khung cuối cảnh trước làm khung đầu, cùng subject với cảnh trước, start để rỗng, tối đa 2 cảnh nối liền).',
    "9. Hai cảnh cắt liền nhau không trùng cả cỡ cảnh lẫn góc máy. Không cảnh bạo lực, máu me, không người lạ.",
    "10. size thuộc EWS, WS, MS, MCU, CU, INSERT; angle thuộc eye, low, high, aerial; move thuộc static, push_in, pull_out, pan, tilt, handheld, orbit, drone.",
    "Chỉ trả lời đúng một khối ```json theo mẫu dưới, không tạo ảnh hay video:",
    "```json",
    '{"props":[{"name":"khúc gỗ","description":"khúc gỗ thông ngắn dài 40 cm, vỏ nâu sẫm","states":["nguyên khúc","bổ đôi"]}],',
    ' "shots":[{"id":"c01","size":"EWS","angle":"aerial","move":"drone","subject":"none","link":"cut","start":"…","motion":"…","props":""}]}',
    "```",
  ]
    .filter(Boolean)
    .join("\n");
}

export function repairPrompt(errors: string[]): string {
  return [`${WRITER_TAG} vừa rồi chưa dùng được vì các lỗi sau. Hãy sửa và trả lại TOÀN BỘ kịch bản trong một khối \`\`\`json, giữ nguyên các cảnh đã đúng:`, ...errors.map((e) => `- ${e}`)].join("\n");
}

// Phiên bản prompt tự tính từ mã nguồn các hàm prompt: sửa prompt là khoá cache node đổi theo,
// bấm Chạy sẽ tạo lại thay vì trả kết quả cũ (gặp 28/10/2026: đổi prompt video nhưng phim vẫn lấy cache).
export function codeVersion(...fns: ((...args: never[]) => unknown)[]): string {
  let h = 5381;
  for (const ch of fns.map((f) => f.toString()).join("\n")) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
