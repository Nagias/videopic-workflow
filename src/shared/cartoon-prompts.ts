import type { CastMember } from "./cast";
import { findMember } from "./cast";
import { CAMERA_ANGLES, CAMERA_MOVES, parsePropLines, SHOT_SECONDS, SHOT_SIZES, type Shot } from "./director";
import type { PropSpecItem } from "./ports";
import { codeVersion, LOCATION_SHEET, type ReferenceView } from "./prompts";
import type { CartoonStyle } from "./styles";

// Mọi prompt phim hoạt hình (thiết kế docs/superpowers/specs/2026-11-06-phim-hoat-hinh-dao-dien-design.md mục 3.2).
// File riêng, không sửa prompt người thật ở prompts.ts. CARTOON_VERSION (cuối file) nằm trong cacheVersion của node Dàn nhân vật;
// mọi node dùng prompt ở đây đều nằm sau Dàn nhân vật, nên sửa chữ ở đây là cả chuỗi chạy lại. Test bắt mọi hàm xuất ra
// phải có trong CARTOON_FUNCTIONS. Công thức kể chuyện học từ phim hài không lời (Chuck Jones, Oggy, Larva), không chép nhân vật.

export const CARTOON_TEXT = {
  look: {
    "hoat-hinh-2d":
      "Phong cách phim hoạt hình 2D vẽ tay truyền hình: nét viền đen rõ ràng, tô màu phẳng, bóng đổ đơn giản một tầng, nhân vật mắt to biểu cảm, hình dáng đơn giản dễ nhận, màu tươi rực rỡ, nền vẽ đơn giản; không phải ảnh chụp, không 3D, không chi tiết chân thực",
    "hoat-hinh-3d":
      "Phong cách phim hoạt hình 3D truyền hình cho thiếu nhi: hình khối đơn giản tròn trịa, bề mặt mịn một màu như đồ chơi nhựa mềm, không vẽ từng sợi lông, không vân da hay chi tiết côn trùng thật, mắt to biểu cảm, màu tươi rực rỡ, ánh sáng mềm và đều; không phải ảnh chụp, không giống con vật thật",
  } satisfies Record<CartoonStyle, string>,
  sheetBackground: "nền tường sáng trơn một màu, sàn phẳng; trên tường có vạch đo chiều cao kẻ ngang cách đều (không ghi số) để so chiều cao các nhân vật",
  still: "Bố cục rõ như một khung phim hoạt hình, nhân vật nổi bật trên nền, không chữ, không logo, không khung truyện tranh, khung ngang 16:9.",
  motion:
    "Hoạt hình chuyển động thật như phim: nhân vật cử động cả thân, tay chân và nét mặt qua từng khung, không phải hình cắt dán trượt trên nền. Diễn xuất kiểu phim hoạt hình hài không lời thoại: động tác cường điệu, có lấy đà trước khi làm, người co giãn khi nhảy và khi va chạm, mắt và miệng biểu cảm phóng đại, phản ứng (giật mình, tức tối, ngơ ngác) giữ lâu một nhịp; va chạm vui nhộn không gây thương tích, không máu; nhân vật chỉ kêu, cười, thở dốc, không nói thành lời; tiếng động hiệu ứng hoạt hình vui nhộn. Giữ đúng hình dáng, màu sắc, phụ kiện và tỉ lệ kích thước của từng nhân vật và đồ vật suốt clip; không đổi cỡ đồ vật; không thêm nhân vật; không cắt cảnh; không chữ; khung ngang 16:9.",
  craft: [
    "Không lời thoại: mọi chuyện kể bằng hành động, biểu cảm và tiếng động.",
    "Cả tập xoay quanh MỘT mục tiêu cụ thể nhìn thấy được mà hai phe tranh nhau (một món đồ, một chỗ, một việc).",
    "Leo thang: mỗi đợt đối đầu là hệ quả trực tiếp của đợt trước và to hơn, liều hơn, hỗn loạn hơn.",
    "Mỗi trò gây cười (gag) có ba nhịp nhìn thấy được: lấy đà/chuẩn bị, hành động, hệ quả. Khán giả thấy kế hoạch trước khi nó hỏng.",
    "Luật ba lần: một trò lặp hai lần, lần thứ ba bẻ ngược bất ngờ.",
    "Đồ vật trong bối cảnh và trọng lực vừa là vũ khí vừa là kẻ thù.",
    "Nhân vật thua bị bẽ mặt chứ không bị thương; không máu, không bạo lực thật, không vũ khí thật.",
    "Sau mỗi cú hỏng có một cảnh phản ứng: cận mặt nhân vật giữ biểu cảm một nhịp.",
    "Không gian nhất quán: đồ vật giữ nguyên chỗ và kích thước trừ khi có nhân vật tác động; nhân vật đi đâu thì phải thấy đường đi.",
    "Kết bằng một cú lật bất ngờ, vui, khép lại mục tiêu ban đầu.",
  ],
} as const;

export const cartoonLook = (style: CartoonStyle, extra = ""): string => [CARTOON_TEXT.look[style], extra.trim()].filter(Boolean).join(". ");

const memberLine = (m: CastMember) => `${m.name}: ${m.look}, kích thước ${m.size}${m.trait ? `, tính cách ${m.trait}` : ""}`;

// Mô tả cả dàn (đi theo bộ ảnh nhân vật, dùng cho Biên kịch và cảnh).
export const castDescription = (members: readonly CastMember[]): string => members.map(memberLine).join("; ");

// Chiều cao (cm) ghi trong kích thước, vd "cao 8 cm, chỉ tới đầu gối Mướp" → 8.
const cmOf = (size: string): number | undefined => {
  const m = /(\d+(?:[.,]\d+)?)\s*cm/i.exec(size);
  return m ? Number(m[1]!.replace(",", ".")) : undefined;
};

// Muse bỏ qua số cm khi vẽ (đo 07/11/2026: gián 9 cm vẽ cao gần bằng mèo 40 cm) → nói thẳng tỉ lệ so với nhân vật cao nhất của cả dàn.
function ratioNote(m: CastMember, all: readonly CastMember[]): string {
  const tallest = all.reduce<CastMember | undefined>((best, x) => ((cmOf(x.size) ?? 0) > (cmOf(best?.size ?? "") ?? 0) ? x : best), undefined);
  const h = cmOf(m.size);
  const top = tallest ? cmOf(tallest.size) : undefined;
  if (!tallest || tallest === m || !h || !top || h >= top * 0.75) return "";
  return ` — chỉ cao bằng 1/${Math.round(top / h)} chiều cao ${tallest.name}`;
}

// members: những nhân vật cần nhắc; all: cả dàn (tỉ lệ luôn so với nhân vật cao nhất của cả dàn).
export const scaleLine = (members: readonly CastMember[], all: readonly CastMember[] = members): string =>
  `Tỉ lệ kích thước, giữ đúng trong mọi ảnh: ${members.map((m) => `${m.name} ${m.size}${ratioNote(m, all)}`).join("; ")}. Nhân vật nhỏ phải trông nhỏ hẳn bên cạnh nhân vật lớn, không phóng to cho dễ nhìn`;

// Bộ ảnh mẫu của dàn: ảnh xếp hàng đúng tỉ lệ (view "front", cũng là ảnh đính kèm khi cảnh phải mở chat mới),
// rồi từng nhân vật nối tiếp trong cùng chat (view "member-<n>").
export function CAST_SHEET(members: readonly CastMember[], style: CartoonStyle): ReferenceView[] {
  const look = cartoonLook(style);
  const list = members.map((m, i) => `${i + 1}) ${memberLine(m)}`).join("; ");
  const lineup: ReferenceView = {
    view: "front",
    label: "cả dàn đúng tỉ lệ",
    prompt: `Tạo 1 ảnh khung ngang 16:9: bảng dàn nhân vật của một phim hoạt hình. Tất cả nhân vật đứng thành một hàng ngang trên cùng một sàn phẳng, quay mặt về phía máy, thấy trọn từ đầu đến chân, đúng tỉ lệ kích thước với nhau: ${list}. ${scaleLine(members)}. Nền: ${CARTOON_TEXT.sheetBackground}. ${look}. Không chữ, không số.`,
  };
  const one = (m: CastMember, i: number): ReferenceView => {
    const body = (where: string) =>
      `chỉ riêng ${m.name} ${where}, đứng ở giữa khung, nhìn gần (thấy trọn từ đầu đến chân và rõ mặt), giữ nguyên hình dáng, màu sắc, phụ kiện: ${m.look}.${m.trait ? ` Dáng đứng và biểu cảm thể hiện tính cách: ${m.trait}.` : ""} Cùng nền và cùng phong cách vẽ.`;
    return {
      view: `member-${i + 1}`,
      label: m.name,
      prompt: `Tạo 1 ảnh khung ngang 16:9: ${body("trong ảnh đính kèm")} ${look}. Không chữ, không số.`,
      inChatPrompt: `Ảnh tiếp theo, khung ngang 16:9: ${body("trong ảnh bạn vừa tạo")} ${look}. Không chữ, không số.`,
    };
  };
  return [lineup, ...members.map(one)];
}

// Bộ ảnh bối cảnh hoạt hình: như LOCATION_SHEET nhưng cấm cả con vật (đo 07/11/2026: tả "lỗ là nhà của lũ gián" thì Muse vẽ
// thêm gián tí hon vào ảnh bối cảnh, ảnh này lại đính kèm mọi cảnh).
const emptyScene = (p: string) => p.replaceAll("không có người", "không có nhân vật hay con vật nào, bối cảnh trống");

export function CARTOON_LOCATION_SHEET(d: string, look: string): ReferenceView[] {
  return LOCATION_SHEET(d, look).map((v) => ({ ...v, prompt: emptyScene(v.prompt), ...(v.inChatPrompt ? { inChatPrompt: emptyScene(v.inChatPrompt) } : {}) }));
}

export function cartoonPropStillPrompt(item: PropSpecItem, style: CartoonStyle): string {
  return `Tạo 1 ảnh khung ngang 16:9: một ${item.name} trong phim hoạt hình: ${item.description}, ở trạng thái ${item.states[0] ?? ""}. Vẽ trọn món đồ ở giữa khung, đặt trên một mặt phẳng đơn giản có bóng đổ nhẹ, không có nhân vật nào. ${cartoonLook(style)}. Không chữ.`;
}

export function cartoonPropStatePrompt(item: PropSpecItem, state: string, style: CartoonStyle, attached = false): string {
  const where = attached ? "trong ảnh đính kèm" : "trong ảnh bạn vừa tạo";
  return `Ảnh tiếp theo, khung ngang 16:9: chính ${item.name} ${where}, cùng góc vẽ, cùng nền và cùng kích thước, nay ở trạng thái: ${state}. Không có nhân vật nào. ${cartoonLook(style)}. Không chữ.`;
}

// Ảnh khung hoạt hình luôn mở chat mới, đính kèm ảnh mẫu (cả dàn, từng nhân vật có mặt, bối cảnh, đồ vật): không dồn
// hàng chục ảnh vào một chat dài, nhân vật hoạt hình không vướng chuyện Muse từ chối ảnh người thật (ARCHITECTURE 6.1).
export type CartoonFrameCtx = {
  members: readonly CastMember[];
  // Câu tông đầy đủ (phong cách hoạt hình + tông riêng của bối cảnh).
  look: string;
  location: string;
  props: { name: string; state: string; description: string }[];
  refs: string[];
};

// Ai có mặt trong khung: theo trường cast của cảnh; cảnh viết tay không có cast thì cả dàn (cảnh có nhân vật).
export function castInShot(
  shot: Pick<Shot, "subject" | "cast">,
  members: readonly CastMember[],
): { present: CastMember[]; absent: CastMember[]; unknown: string[] } {
  if (shot.subject === "none") return { present: [], absent: [...members], unknown: [] };
  if (!shot.cast) return { present: [...members], absent: [], unknown: [] };
  const present: CastMember[] = [];
  const unknown: string[] = [];
  for (const name of shot.cast) {
    const m = findMember(members, name);
    if (m) {
      if (!present.includes(m)) present.push(m);
    } else unknown.push(name);
  }
  return { present, absent: members.filter((m) => !present.includes(m)), unknown };
}

const cartoonFraming = (shot: Shot) => `Khung hình: ${SHOT_SIZES[shot.size].vi.replace(/người/g, "nhân vật")}, ${CAMERA_ANGLES[shot.angle].vi}.`;

function castLines(shot: Shot, members: readonly CastMember[]): string[] {
  const { present, absent } = castInShot(shot, members);
  if (present.length === 0) return ["Không có nhân vật nào trong khung."];
  return [
    `Trong khung chỉ có: ${present.map((m) => `${m.name} (${m.look}, ${m.size})`).join("; ")}.`,
    absent.length ? `Không có trong khung: ${absent.map((m) => m.name).join(", ")}.` : "",
    `${scaleLine(present, members)}.`,
  ];
}

export function cartoonKeyframePrompt(shot: Shot, c: CartoonFrameCtx): string {
  const refs = c.refs.length ? `Ảnh đính kèm theo thứ tự: ${c.refs.map((r, i) => `ảnh ${i + 1}: ${r}`).join("; ")}.` : "";
  const props = c.props.length
    ? `Đồ vật trong khung, giống hệt ảnh mẫu và đúng kích thước đã tả: ${c.props.map((p) => `${p.name} (${p.state}) — ${p.description}`).join("; ")}.`
    : "";
  return [
    "Tạo 1 ảnh khung ngang 16:9, khung hình tiếp theo của cùng một tập phim hoạt hình.",
    refs,
    c.refs.length ? "Nhân vật và đồ vật giữ đúng như ảnh mẫu đính kèm: cùng hình dáng, màu sắc, phụ kiện, nét vẽ và tỉ lệ kích thước." : "",
    ...castLines(shot, c.members),
    cartoonFraming(shot),
    `Lúc này: ${shot.start.trim()}.`,
    props,
    `Bối cảnh: ${c.location}, giữ đúng như ảnh bối cảnh.`,
    "Đây là ảnh đứng yên của khoảnh khắc bắt đầu, chưa có hành động nào diễn ra.",
    `${c.look}. ${CARTOON_TEXT.still}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function cartoonEndStates(shot: Shot): string {
  const changed = parsePropLines(shot.props).items.filter((p) => p.to && p.to.toLowerCase() !== p.from.toLowerCase());
  return changed.length ? `Đồ vật cuối cảnh: ${changed.map((p) => `${p.name} ${p.to}`).join(", ")}.` : "";
}

export function cartoonMotionPrompt(shot: Shot, c: { members: readonly CastMember[] }): string {
  const { present } = castInShot(shot, c.members);
  return [
    `Tạo video ${SHOT_SECONDS} giây từ ảnh đính kèm, giữ nguyên nhân vật, đồ vật và bối cảnh trong ảnh.`,
    `Việc xảy ra sau khung hình này: ${shot.motion.trim()}.`,
    shot.end?.trim() ? `Cuối ${SHOT_SECONDS} giây: ${shot.end.trim()}.` : "",
    cartoonEndStates(shot),
    // Tả cả ngoại hình như ảnh khung: đo 07/11/2026 chỉ có tên thì máy tạo video tô thân "gián Xanh" thành xanh, "gián Vàng"
    // thành vàng; cảnh không nhân vật thì vẽ thêm con chuột chui ra từ lỗ tường.
    present.length
      ? `Nhân vật trong cảnh: ${present.map((m) => `${m.name} (${m.look}, ${m.size})`).join("; ")}; không thêm nhân vật hay con vật khác. Tên gọi chỉ là tên, không phải màu: màu thân và mặt từng nhân vật giữ đúng như ảnh suốt clip.`
      : "Không có nhân vật hay con vật nào xuất hiện.",
    `Máy quay: ${CAMERA_MOVES[shot.move].vi}.`,
    CARTOON_TEXT.motion,
  ]
    .filter(Boolean)
    .join(" ");
}

// ——— Ý tưởng tập, dàn ý, biên kịch theo đợt ———

export const IDEAS_TAG = "Ý TƯỞNG TẬP PHIM JSON";
export const OUTLINE_TAG = "DÀN Ý TẬP PHIM JSON";
export const EPISODE_TAG = "KỊCH BẢN JSON";

export type EpisodeCtx = { members: readonly CastMember[]; rules: string; location?: string };

const craftBlock = () => ["Kiến thức đạo diễn phim hoạt hình hài:", ...CARTOON_TEXT.craft.map((r, i) => `${i + 1}. ${r}`)].join("\n");

const contextBlock = (c: EpisodeCtx) =>
  [
    `Dàn nhân vật (gọi đúng tên): ${castDescription(c.members)}.`,
    `${scaleLine(c.members)}.`,
    c.rules.trim() ? `Luật của loạt phim: ${c.rules.trim()}` : "",
    c.location?.trim() ? `Bối cảnh của tập này (mọi chuyện diễn ra ở đây): ${c.location.trim()}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

export function ideasPrompt(c: EpisodeCtx & { hint: string }): string {
  return [
    `Bạn là đạo diễn kiêm biên kịch của một loạt phim hoạt hình hài ngắn không lời thoại. Hãy đề xuất ${IDEAS_TAG}.`,
    contextBlock(c),
    c.hint.trim() ? `Gợi ý của chủ kênh cho tập này: ${c.hint.trim()}` : "",
    craftBlock(),
    "Hãy đề xuất đúng 3 ý tưởng tập phim KHÁC HẲN nhau. Mỗi ý tưởng: một mục tiêu cụ thể hai phe tranh nhau trong bối cảnh này, các đợt leo thang dùng đồ vật có sẵn trong bối cảnh, và một cú chốt bất ngờ.",
    "Chỉ trả lời đúng một khối ```json theo mẫu, không tạo ảnh hay video:",
    "```json",
    '{"ideas":[{"title":"…","logline":"…","escalation":"…","twist":"…"}]}',
    "```",
  ]
    .filter(Boolean)
    .join("\n");
}

export type EpisodeIdea = { title: string; logline: string; escalation: string; twist: string };

export const ideaText = (i: EpisodeIdea): string => `${i.title}: ${i.logline} Leo thang: ${i.escalation} Chốt: ${i.twist}`;

export function outlinePrompt(c: EpisodeCtx & { idea: string; shotCount: number }): string {
  const minutes = ((c.shotCount * SHOT_SECONDS) / 60).toFixed(1).replace(".0", "");
  return [
    `Bạn là đạo diễn phim hoạt hình hài không lời thoại. Hãy viết ${OUTLINE_TAG} cho tập phim dưới đây.`,
    `Ý tưởng tập: ${c.idea.trim()}`,
    contextBlock(c),
    craftBlock(),
    `Độ dài: đúng ${c.shotCount} cảnh, mỗi cảnh ${SHOT_SECONDS} giây (khoảng ${minutes} phút).`,
    "Cấu trúc bắt buộc, 3 phần nối liền, đánh số cảnh liên tục từ 1:",
    '- Phần 1 "Gây chuyện" (khoảng 15% số cảnh): giới thiệu bối cảnh, nhân vật và mục tiêu tranh giành.',
    '- Phần 2 "Leo thang" (khoảng 70%): 3 đến 5 đợt đối đầu; mỗi đợt là hệ quả của đợt trước và to hơn đợt trước; mỗi đợt có một trò gây cười chính nhìn thấy được.',
    '- Phần 3 "Chốt" (khoảng 15%): cú lật bất ngờ và kết vui.',
    "Mỗi đợt (beat) ghi: cảnh từ–đến, chuyện gì xảy ra theo nhân quả, và cuối đợt ai ở đâu, đồ vật nào ở đâu, to cỡ nào.",
    'Liệt kê các đồ vật quan trọng trong "props", mỗi món có kích thước so với nhân vật (vd "cao bằng nửa Mướp").',
    "Chỉ trả lời đúng một khối ```json theo mẫu, không tạo ảnh hay video:",
    "```json",
    '{"title":"…","props":[{"name":"…","size":"…"}],"parts":[{"name":"Gây chuyện","beats":[{"from":1,"to":4,"what":"…","end":"…"}]},{"name":"Leo thang","beats":[]},{"name":"Chốt","beats":[]}]}',
    "```",
  ].join("\n");
}

export type OutlineBeat = { from: number; to: number; what: string; end: string };
export type EpisodeOutline = { title: string; props: { name: string; size: string }[]; parts: { name: string; beats: OutlineBeat[] }[] };

export function outlineText(o: EpisodeOutline): string {
  const lines = [`Tên tập: ${o.title}`];
  if (o.props.length) lines.push(`Đồ vật quan trọng: ${o.props.map((p) => `${p.name} (${p.size})`).join("; ")}`);
  o.parts.forEach((p, i) => {
    lines.push(`Phần ${i + 1} · ${p.name}`);
    for (const b of p.beats) lines.push(`- Cảnh ${b.from}–${b.to}: ${b.what} Cuối đợt: ${b.end}`);
  });
  return lines.join("\n");
}

export function ideasRepairPrompt(errors: string[]): string {
  return [`${IDEAS_TAG} vừa rồi chưa dùng được vì các lỗi sau. Hãy trả lại đúng 3 ý tưởng trong một khối \`\`\`json:`, ...errors.map((e) => `- ${e}`)].join(
    "\n",
  );
}

export function outlineRepairPrompt(errors: string[]): string {
  return [
    `${OUTLINE_TAG} vừa rồi chưa dùng được vì các lỗi sau. Hãy sửa và trả lại TOÀN BỘ dàn ý trong một khối \`\`\`json:`,
    ...errors.map((e) => `- ${e}`),
  ].join("\n");
}

export const BATCH_SIZE = 12;

const shotRules = (members: readonly CastMember[]) =>
  [
    "Luật viết cảnh:",
    "1. Cảnh 1 là cảnh rộng nhất giới thiệu bối cảnh (size EWS hoặc WS).",
    "2. start = khung đầu, là ẢNH ĐỨNG YÊN: ai đứng ở đâu trong khung (trái, phải, giữa; trên, dưới, cạnh đồ vật nào), quay hướng nào, đồ vật nằm đâu và to cỡ nào so với nhân vật. Cảnh cắt ngay sau một cảnh khác phải có start khớp với end của cảnh liền trước (cùng vị trí, cùng kích thước, cùng tình trạng đồ vật), chỉ đổi góc máy hoặc cỡ cảnh.",
    `3. motion = việc xảy ra trong ${SHOT_SECONDS} giây sau khung đầu, theo kiểu phim hoạt hình hài: một trò rõ ràng có lấy đà và hệ quả nhìn thấy được, động tác cường điệu; gọi nhân vật đúng tên; không tả lại khung đầu.`,
    "4. end = khoảnh khắc cuối cảnh: ai ở đâu, tư thế, biểu cảm; đồ vật ở đâu, tình trạng gì, to cỡ nào.",
    `5. cast = danh sách tên nhân vật CÓ MẶT trong khung, đúng tên trong dàn: ${members.map((m) => `"${m.name}"`).join(", ")}. Cảnh không có nhân vật thì cast là [] và subject "none".`,
    '6. subject chỉ là "character" (có nhân vật) hoặc "none" (không nhân vật: cận đồ vật, toàn cảnh bối cảnh).',
    '7. "props" liệt kê mọi đồ vật quan trọng với mô tả cụ thể gồm hình dáng, màu và KÍCH THƯỚC so với nhân vật, kèm các trạng thái; trạng thái đầu là trạng thái gốc.',
    '8. Trường props của mỗi cảnh ghi đồ vật trong khung, mỗi dòng "tên: trạng thái đầu -> trạng thái cuối" hoặc "tên: trạng thái"; tối đa 2 món mỗi cảnh; tên và trạng thái phải đúng như trong "props". Đồ vật xuất hiện lại phải đúng trạng thái cuối lần trước; đồ vật đổi trạng thái thì trong khung phải có nhân vật.',
    '9. link: "cut" (cắt cảnh) hoặc "chain" (nối tiếp: lấy khung cuối cảnh trước làm khung đầu, cùng subject với cảnh trước, start để rỗng, tối đa 2 cảnh nối liền). Dùng "chain" khi hành động đang dở dang chạy sang cảnh sau.',
    "10. Hai cảnh cắt liền nhau không trùng cả cỡ cảnh lẫn góc máy. Sau mỗi cú hỏng nên có một cảnh cận (MCU hoặc CU) phản ứng của nhân vật.",
    "11. size thuộc EWS, WS, MS, MCU, CU, INSERT; angle thuộc eye, low, high, aerial; move thuộc static, push_in, pull_out, pan, tilt, handheld, orbit, drone.",
  ].join("\n");

const batchLine = (from: number, to: number) => `Đợt này: cảnh ${from} đến ${to}.`;

const jsonTemplate = (from: number) =>
  [
    "Chỉ trả lời đúng một khối ```json theo mẫu dưới (chỉ các cảnh của đợt này, id đánh liên tục), không tạo ảnh hay video:",
    "```json",
    `{"props":[{"name":"…","description":"… (kích thước so với nhân vật)","states":["…"]}],`,
    ` "shots":[{"id":"c${String(from).padStart(2, "0")}","size":"WS","angle":"eye","move":"static","subject":"character","link":"cut","cast":["…"],"start":"…","motion":"…","end":"…","props":""}]}`,
    "```",
  ].join("\n");

export type EpisodeWriterArgs = EpisodeCtx & { story: string; shotCount: number };

// Lời đầu của Biên kịch hoạt hình: đủ bối cảnh + đợt đầu. story: dàn ý (hoặc ý tưởng khi không có dàn ý).
export function episodeWriterPrompt(w: EpisodeWriterArgs, from: number, to: number): string {
  return [
    `Bạn là đạo diễn kiêm biên kịch phim hoạt hình hài không lời thoại. Hãy viết ${EPISODE_TAG} cho tập phim dưới đây, từng đợt một.`,
    `Dàn ý tập phim (bám đúng thứ tự và số cảnh):\n${w.story.trim()}`,
    contextBlock(w),
    craftBlock(),
    `Tổng số cảnh: ${w.shotCount} (mỗi cảnh ${SHOT_SECONDS} giây).`,
    shotRules(w.members),
    batchLine(from, to),
    jsonTemplate(from),
  ].join("\n");
}

// Đợt sau, cùng chat: nhắc cuối cảnh liền trước để khung đầu khớp.
export function episodeContinuePrompt(from: number, to: number, prevEnd: string, members: readonly CastMember[]): string {
  return [
    `Viết tiếp ${EPISODE_TAG}, cùng dàn ý và cùng các luật trên. ${batchLine(from, to)}`,
    `Tên nhân vật hợp lệ cho cast: ${members.map((m) => `"${m.name}"`).join(", ")}.`,
    `Cuối cảnh ${from - 1} (khung đầu cảnh ${from} phải khớp nếu là cảnh cắt): ${prevEnd}`,
    'Đồ vật mới chưa khai báo thì thêm vào "props"; món đã khai báo thì không lặp lại.',
    jsonTemplate(from),
  ].join("\n");
}

// Chat cũ hỏng: chat mới không biết các đợt trước → gửi lại đủ bối cảnh, tóm tắt cuối các cảnh đã viết và đồ vật đã có.
export function episodeFallbackPrompt(w: EpisodeWriterArgs, from: number, to: number, written: { id: string; end: string }[], props: PropSpecItem[]): string {
  const done = written.map((s) => `${s.id}: ${s.end}`).join("\n");
  const known = props.map((p) => `${p.name} — ${p.description} — trạng thái: ${p.states.join(", ")}`).join("; ");
  return [
    episodeWriterPrompt(w, from, to),
    `Các cảnh 1 đến ${from - 1} đã viết xong; cuối từng cảnh:\n${done}`,
    known ? `Đồ vật đã khai báo (dùng lại đúng tên và trạng thái, không khai báo lại): ${known}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function episodeRepairPrompt(from: number, to: number, errors: string[]): string {
  return [
    `Đợt cảnh ${from} đến ${to} vừa rồi chưa dùng được vì các lỗi sau. Hãy sửa và trả lại TOÀN BỘ đợt này trong một khối \`\`\`json:`,
    ...errors.map((e) => `- ${e}`),
  ].join("\n");
}

// Mọi hàm xuất ra của file (test bắt đủ); phiên bản = mã nguồn các hàm + toàn bộ câu chữ CARTOON_TEXT.
export const CARTOON_FUNCTIONS = [
  // Hàm nội bộ cũng vào phiên bản: sửa chúng là đổi chữ prompt.
  memberLine,
  cmOf,
  ratioNote,
  cartoonFraming,
  castLines,
  cartoonEndStates,
  craftBlock,
  contextBlock,
  shotRules,
  batchLine,
  jsonTemplate,
  emptyScene,
  cartoonLook,
  castDescription,
  CARTOON_LOCATION_SHEET,
  scaleLine,
  CAST_SHEET,
  cartoonPropStillPrompt,
  cartoonPropStatePrompt,
  castInShot,
  cartoonKeyframePrompt,
  cartoonMotionPrompt,
  ideasPrompt,
  ideaText,
  ideasRepairPrompt,
  outlinePrompt,
  outlineText,
  outlineRepairPrompt,
  episodeWriterPrompt,
  episodeContinuePrompt,
  episodeFallbackPrompt,
  episodeRepairPrompt,
] as const;

function hashText(text: string): string {
  let h = 5381;
  for (const ch of text) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
export const CARTOON_VERSION = `${codeVersion(...CARTOON_FUNCTIONS)}.${hashText(JSON.stringify(CARTOON_TEXT))}`;
