import { z } from "zod";
import { CAMERA_ANGLES, CAMERA_MOVES, SHOT_SIZES, SUBJECTS, type Shot } from "../../shared/director";
import { defineNode, type EstimateKnown } from "../../shared/node-definition";
import { mediaIdOf, pickInput, type NodeOutputs } from "../../shared/ports";
import { chainFrameKey, shotFromCache, type ShotCacheInputs } from "../../shared/shot-plan";
import { PROVIDER_IDS, type ProviderId } from "../../shared/providers";
import { SHOT_CACHE_VERSION } from "../film/definition";

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

// Một cảnh của Dựng phim, thành node riêng. Cắt hay nối không còn là tham số: có dây "Nối tiếp" là cảnh nối.
export type SceneParams = Omit<Shot, "id" | "link"> & { provider: ProviderId; take?: number };

export const params = z.object({
  size: z.enum(keys(SHOT_SIZES)),
  angle: z.enum(keys(CAMERA_ANGLES)),
  move: z.enum(keys(CAMERA_MOVES)),
  subject: z.enum(keys(SUBJECTS)),
  start: z.string(),
  motion: z.string(),
  props: z.string(),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
  // Lần tạo: không có mặc định, để thiếu vẫn là thiếu (khoá cache cũ giữ nguyên).
  take: z.number().int().min(1).optional(),
}) satisfies z.ZodType<SceneParams>;

// Cảnh của node: có dây Nối tiếp là cảnh nối. Mã cảnh không vào prompt hay khoá bước con nào, chỉ để dùng chung kiểu Shot với Dựng phim.
export const sceneShot = (p: SceneParams, follows: boolean): Shot => ({
  id: "scene",
  link: follows ? "chain" : "cut",
  size: p.size,
  angle: p.angle,
  move: p.move,
  subject: p.subject,
  start: p.start,
  motion: p.motion,
  props: p.props,
});

// Đầu vào đã biết của cảnh, dạng shotFromCache() cần (cổng chưa biết thì vắng).
const cacheInputs = (p: SceneParams, known: EstimateKnown | undefined): ShotCacheInputs => {
  const inputs = known?.inputs ?? {};
  return {
    providerId: p.provider,
    character: pickInput(inputs, "character", "imageset"),
    location: pickInput(inputs, "location", "imageset"),
    props: pickInput(inputs, "props", "props"),
    prevClipId: pickInput(inputs, "follow", "video")?.mediaId,
  };
};

export const definition = defineNode<SceneParams>({
  type: "scene",
  label: "Cảnh",
  description: "Một cảnh 5 giây: ảnh khung (hoặc khung cuối cảnh trước) → clip, đo độ sáng để Ghép phim bù.",
  inputs: [
    { name: "character", kind: "imageset", label: "Nhân vật" },
    { name: "location", kind: "imageset", label: "Không gian" },
    { name: "props", kind: "props", label: "Đồ vật", optional: true },
    { name: "follow", kind: "video", label: "Nối tiếp", optional: true },
  ],
  outputs: [
    { name: "clip", kind: "video", label: "Clip" },
    { name: "frame", kind: "image", label: "Khung đầu" },
    { name: "last", kind: "image", label: "Khung cuối" },
  ],
  // Cùng vùng bước con và cùng phiên bản prompt với Dựng phim: cảnh giống hệt dùng lại kết quả của nhau.
  stepScope: "film",
  cacheVersion: SHOT_CACHE_VERSION,
  params,
  defaults: { size: "MS", angle: "eye", move: "static", subject: "character", start: "", motion: "", props: "", provider: "fake" },
  // Theo đúng khoá bước con của makeShot(): biết đầu vào thì chỉ đếm bước còn thiếu cache; chưa biết thì cảnh nối hoặc
  // chữ→video 1 video, còn lại 1 ảnh + 1 video.
  estimate: (p, connected, known) => shotFromCache(sceneShot(p, connected.has("follow")), cacheInputs(p, known), (k) => known?.step(k)).calls,
  // Clip (và khung đầu, khung cuối nếu đã rút) lấy từ cache bước con, kích thước/thời lượng từ bảng media: cảnh nối phía sau
  // biết đúng clip cảnh trước. Không có meta ghép (`clip.clip`): cần ffprobe, không node nào ước tính dùng tới.
  predict(p, connected, known) {
    const r = shotFromCache(sceneShot(p, connected.has("follow")), cacheInputs(p, known), (k) => known.step(k));
    const clip = r.clipId === undefined ? undefined : known.media(r.clipId);
    if (r.clipId === undefined || !clip || clip.width === null || clip.height === null || clip.durationSec === null) return undefined;
    const out: NodeOutputs = { clip: { kind: "video", mediaId: r.clipId, durationSec: clip.durationSec, width: clip.width, height: clip.height } };
    const image = (mediaId: string | undefined) => {
      const m = mediaId === undefined ? undefined : known.media(mediaId);
      return mediaId === undefined || !m || m.width === null || m.height === null ? undefined : { kind: "image" as const, mediaId, width: m.width, height: m.height };
    };
    const frame = image(r.keyframeId);
    const last = image(mediaIdOf(known.step(chainFrameKey(r.clipId))));
    if (frame) out.frame = frame;
    if (last) out.last = last;
    return out;
  },
});
