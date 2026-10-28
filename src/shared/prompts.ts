import { CAMERA_ANGLES, CAMERA_MOVES, parsePropLines, SHOT_SIZES, type Shot } from "./director";
import type { PropSpecItem } from "./ports";

// Mọi prompt gửi Muse của luồng phim nằm ở đây (gửi nguyên văn, tiếng Việt).
// Đo thật 28/10/2026 (TASKS.md): giọng "ảnh điện thoại, trời âm u, bối cảnh đơn giản" bớt nhựa rõ;
// prompt video chỉ tả việc xảy ra SAU khung đầu thì hết lỗi vật lý. Cấm "cinematic", "photorealistic", "2K".
// Cách chia khung đầu / chuyển động học từ ViMax (MIT), bộ ảnh mẫu học từ Toonflow (MIT) — xem NOTICE.md.

export const DEFAULT_LOOK = "Ảnh chụp bằng điện thoại như khung hình vlog, ánh sáng tự nhiên, trời hơi âm u, màu tự nhiên không chỉnh màu";

const VIDEO_RULES = "Chuyển động thật, có lực, đúng vật lý; không nhìn vào máy quay, không thêm người, không cắt cảnh, không chữ, khung ngang 16:9.";
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
  const hands = shot.subject === "hands" ? " Chỉ thấy bàn tay và cẳng tay của người đó, không thấy mặt." : "";
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

export function propStatePrompt(item: PropSpecItem, state: string, look: string): string {
  return `Ảnh tiếp theo, khung ngang 16:9: chính ${item.name} trong ảnh bạn vừa tạo, cùng góc chụp và nền, nay ở trạng thái: ${state}. Không có người, không có tay người. ${look}. Không chữ.`;
}
