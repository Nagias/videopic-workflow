import { z } from "zod";

// Kiến thức đạo diễn dạng dữ liệu: mỗi lựa chọn có nhãn tiếng Việt (giao diện) và câu tiếng Anh (prompt Muse).

export const SHOT_SIZES = {
  EWS: { label: "Toàn cảnh rất rộng", en: "extreme wide establishing shot" },
  WS: { label: "Toàn cảnh", en: "wide shot, full body visible" },
  MS: { label: "Trung cảnh", en: "medium shot from the waist up" },
  MCU: { label: "Cận trung", en: "medium close-up from the chest up" },
  CU: { label: "Cận cảnh", en: "close-up" },
  INSERT: { label: "Cận chi tiết", en: "extreme close-up insert of the detail" },
} as const;

export const CAMERA_ANGLES = {
  eye: { label: "Ngang tầm mắt", en: "eye-level camera" },
  low: { label: "Góc thấp", en: "low-angle camera" },
  high: { label: "Góc cao", en: "high-angle camera" },
  aerial: { label: "Từ trên cao (flycam)", en: "aerial drone view" },
} as const;

export const CAMERA_MOVES = {
  static: { label: "Đứng yên", en: "locked-off static camera" },
  push_in: { label: "Đẩy vào chậm", en: "slow dolly push-in" },
  pull_out: { label: "Kéo ra chậm", en: "slow dolly pull-out" },
  pan: { label: "Lia ngang", en: "slow horizontal pan" },
  tilt: { label: "Lia dọc", en: "slow tilt" },
  handheld: { label: "Cầm tay", en: "subtle handheld camera with natural sway" },
  orbit: { label: "Quay vòng", en: "slow orbit around the subject" },
  drone: { label: "Flycam bay tới", en: "slow aerial drone glide forward" },
} as const;

export type ShotSize = keyof typeof SHOT_SIZES;
export type CameraAngle = keyof typeof CAMERA_ANGLES;
export type CameraMove = keyof typeof CAMERA_MOVES;

export const SUBJECTS = {
  character: { label: "Có nhân vật" },
  hands: { label: "Chỉ thấy tay nhân vật" },
  none: { label: "Không người (B-roll)" },
} as const;
export type ShotSubject = keyof typeof SUBJECTS;

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

// Dữ liệu cũ (trước 28/10/2026) chỉ có `action`: đọc thành khung đầu = chuyển động = action để workflow cũ vẫn chạy.
function upgradeLegacyShot(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;
  const action = typeof r.action === "string" ? r.action : "";
  return { start: action, motion: action, props: "", ...r };
}

export const ShotSchema = z.preprocess(
  upgradeLegacyShot,
  z.object({
    id: z.string().min(1),
    size: z.enum(keys(SHOT_SIZES)),
    angle: z.enum(keys(CAMERA_ANGLES)),
    move: z.enum(keys(CAMERA_MOVES)),
    subject: z.enum(keys(SUBJECTS)),
    link: z.enum(["cut", "chain"]),
    start: z.string(),
    motion: z.string(),
    props: z.string(),
  }),
);
export type Shot = z.infer<typeof ShotSchema>;

export const MAX_CHAIN_RUN = 2;

export type ShotListCheck = { errors: string[]; warnings: string[] };

export type PropUse = { name: string; from: string; to?: string };

export function parsePropLines(text: string): { items: PropUse[]; errors: string[] } {
  const items: PropUse[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const m = /^([^:]+):(.+)$/.exec(t);
    const name = m?.[1]?.trim() ?? "";
    const parts = (m?.[2] ?? "").split("->").map((x) => x.trim());
    const [from, to] = parts;
    if (!m || !name || !from || parts.length > 2 || to === "") {
      errors.push(`dòng ${i + 1} "${t}" phải có dạng "tên: trạng thái" hoặc "tên: trạng thái đầu -> trạng thái cuối"`);
      return;
    }
    items.push(to ? { name, from, to } : { name, from });
  });
  return { items, errors };
}

export type KnownProp = { name: string; states: string[] };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const MAX_PROP_REFS = 2;

function checkProps(shots: Shot[], known: KnownProp[] | undefined, errors: string[], warnings: string[]): void {
  const lastState = new Map<string, { name: string; state: string }>();
  shots.forEach((s, i) => {
    const n = i + 1;
    const parsed = parsePropLines(s.props);
    for (const e of parsed.errors) errors.push(`Cảnh ${n}: đồ vật ${e}`);
    if (parsed.items.length > MAX_PROP_REFS) {
      warnings.push(`Cảnh ${n}: có ${parsed.items.length} đồ vật — chỉ ${MAX_PROP_REFS} món (ưu tiên món đổi trạng thái) được gửi kèm ảnh mẫu`);
    }
    for (const p of parsed.items) {
      if (known) {
        const k = known.find((x) => same(x.name, p.name));
        if (!k) {
          errors.push(`Cảnh ${n}: chưa có đồ vật "${p.name}" trong node Đồ vật`);
          continue;
        }
        for (const st of p.to ? [p.from, p.to] : [p.from]) {
          if (!k.states.some((x) => same(x, st))) errors.push(`Cảnh ${n}: "${p.name}" không có trạng thái "${st}" (có: ${k.states.join(", ")})`);
        }
      }
      const key = p.name.trim().toLowerCase();
      const last = lastState.get(key);
      if (last && !same(last.state, p.from)) {
        errors.push(`Cảnh ${n}: "${p.name}" đang ở trạng thái "${last.state}" (sau các cảnh trước) nhưng cảnh này ghi "${p.from}"`);
      }
      if (p.to && !same(p.to, p.from) && s.subject === "none") {
        errors.push(`Cảnh ${n}: "${p.name}" đổi trạng thái nhưng không có người tác động trong khung — chọn "${SUBJECTS.character.label}" hoặc "${SUBJECTS.hands.label}"`);
      }
      lastState.set(key, { name: p.name, state: p.to ?? p.from });
    }
  });
}

export function checkShotList(shots: Shot[], known?: KnownProp[]): ShotListCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (shots.length === 0) errors.push("Danh sách cảnh đang trống");
  const ids = new Set<string>();
  let run = 0;
  shots.forEach((s, i) => {
    const n = i + 1;
    if (ids.has(s.id)) errors.push(`Cảnh ${n}: trùng mã "${s.id}"`);
    ids.add(s.id);
    if (!s.motion.trim()) errors.push(`Cảnh ${n}: chưa tả chuyển động (việc xảy ra trong 5 giây của cảnh)`);
    if (s.link === "cut" && !s.start.trim()) errors.push(`Cảnh ${n}: chưa tả khung đầu (ảnh đứng yên lúc cảnh bắt đầu)`);
    if (s.start.trim() && same(s.start, s.motion)) {
      warnings.push(`Cảnh ${n}: khung đầu và chuyển động giống hệt nhau — hãy tả chuyển động là việc xảy ra SAU khung đầu`);
    }
    if (s.link === "chain") {
      const prev = shots[i - 1];
      if (!prev) errors.push(`Cảnh ${n}: cảnh đầu tiên không thể "nối" từ cảnh trước`);
      else if (prev.subject !== s.subject) errors.push(`Cảnh ${n}: "nối" phải cùng chủ thể với cảnh ${n - 1}`);
      run++;
      if (run > MAX_CHAIN_RUN) errors.push(`Cảnh ${n}: nối liền quá ${MAX_CHAIN_RUN} cảnh — mặt sẽ trôi, hãy cắt sang góc khác`);
    } else {
      run = 0;
      const prev = shots[i - 1];
      if (prev && prev.subject === s.subject && prev.size === s.size && prev.angle === s.angle) {
        warnings.push(`Cảnh ${n}: cùng cỡ cảnh và góc máy với cảnh ${n - 1} — cắt sẽ trông như giật hình (luật 30°)`);
      }
    }
  });
  checkProps(shots, known, errors, warnings);
  return { errors, warnings };
}

export function composeKeyframePrompt(shot: Shot, character: string, location: string): string {
  const size = SHOT_SIZES[shot.size].en;
  const angle = CAMERA_ANGLES[shot.angle].en;
  const parts = [
    `Photorealistic cinematic still frame from a survival documentary filmed on a real camera, ${size}, ${angle}`,
    shot.subject === "character" ? `Subject: ${character}. ${shot.start}` : `${shot.start}. No people in frame`,
    `Location: ${location}`,
    shot.subject === "character"
      ? "Keep the woman's face, hair, body and outfit exactly as in the character reference photos; keep the tent, stream and landscape exactly as in the location photos"
      : "Keep the tent, stream and landscape exactly as in the location photos",
    "Natural light, realistic skin and textures, no makeup look, no text",
  ];
  return parts.join(". ");
}

export function composeInChatKeyframePrompt(shot: Shot, location: string): string {
  return [
    "Next photo in the same story: the very same woman from the portraits you created earlier in this conversation — exactly the same face, hair, body and outfit",
    `${SHOT_SIZES[shot.size].en}, ${CAMERA_ANGLES[shot.angle].en}`,
    shot.start,
    `Location: ${location}. Keep the tent, stream and landscape exactly as in the attached location photo`,
    "Photorealistic still from a survival documentary, natural light, realistic skin, no text",
  ].join(". ");
}

export function composeMotionPrompt(shot: Shot): string {
  const keep = shot.subject === "character" ? "keep her face, hair and outfit exactly unchanged, " : "";
  return `${shot.motion}. Camera: ${CAMERA_MOVES[shot.move].en}. Natural realistic motion, ${keep}no cuts, no new people`;
}
