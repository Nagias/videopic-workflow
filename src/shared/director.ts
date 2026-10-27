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

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const ShotSchema = z.object({
  id: z.string().min(1),
  size: z.enum(keys(SHOT_SIZES)),
  angle: z.enum(keys(CAMERA_ANGLES)),
  move: z.enum(keys(CAMERA_MOVES)),
  subject: z.enum(["character", "none"]),
  link: z.enum(["cut", "chain"]),
  action: z.string().trim().min(1, "Cảnh chưa có mô tả hành động"),
});
export type Shot = z.infer<typeof ShotSchema>;

export const MAX_CHAIN_RUN = 2;

export type ShotListCheck = { errors: string[]; warnings: string[] };

export function checkShotList(shots: Shot[]): ShotListCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (shots.length === 0) errors.push("Danh sách cảnh đang trống");
  const ids = new Set<string>();
  let run = 0;
  shots.forEach((s, i) => {
    const n = i + 1;
    if (ids.has(s.id)) errors.push(`Cảnh ${n}: trùng mã "${s.id}"`);
    ids.add(s.id);
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
  return { errors, warnings };
}

export function composeKeyframePrompt(shot: Shot, character: string, location: string): string {
  const size = SHOT_SIZES[shot.size].en;
  const angle = CAMERA_ANGLES[shot.angle].en;
  const parts = [
    `Photorealistic cinematic still frame from a survival documentary filmed on a real camera, ${size}, ${angle}`,
    shot.subject === "character" ? `Subject: ${character}. ${shot.action}` : `${shot.action}. No people in frame`,
    `Location: ${location}`,
    shot.subject === "character"
      ? "Keep the woman's face, hair, body and outfit exactly as in the character reference photos; keep the tent, stream and landscape exactly as in the location photos"
      : "Keep the tent, stream and landscape exactly as in the location photos",
    "Natural light, realistic skin and textures, no makeup look, no text",
  ];
  return parts.join(". ");
}

export function composeMotionPrompt(shot: Shot): string {
  const keep = shot.subject === "character" ? "keep her face, hair and outfit exactly unchanged, " : "";
  return `${shot.action}. Camera: ${CAMERA_MOVES[shot.move].en}. Natural realistic motion, ${keep}no cuts, no new people`;
}
