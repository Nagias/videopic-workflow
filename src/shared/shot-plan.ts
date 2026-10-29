import { MAX_PROP_REFS, parsePropLines, SHOT_SECONDS, textOnly, type Shot } from "./director";
import type { Calls } from "./node-definition";
import { mediaIdOf, type ImageSetValue, type PropSetValue } from "./ports";
import { DEFAULT_LOOK, keyframePrompt, motionPrompt, textVideoPrompt, type KeyframeCtx } from "./prompts";

// Khoá bước con (ctx.step) và yêu cầu gửi dịch vụ của từng bước tạo một cảnh. Một nơi duy nhất:
// makeShot() (src/nodes/film/shot-steps.ts) chạy theo đây, ước tính lượt của node Cảnh tra cache theo đây (shotCalls()).
// Dựng phim và Cảnh cùng stepScope "film": đổi mảng khoá ở đây là mất cache cũ của cả hai.

export type ShotRef = { mediaId: string; role: string };
type ChatRef = NonNullable<ImageSetValue["session"]>;

export type ShotInputs = { shot: Shot; providerId: string; character: ImageSetValue; location: ImageSetValue; props?: PropSetValue };

export type KeyframeStep = {
  keyParts: unknown[];
  prompt: string;
  references: ShotRef[];
  // Có người và nhân vật có chat phụ: tạo trong chat đó; dịch vụ không tiếp tục được chat thì dùng fallback (chat mới).
  chat?: { session: ChatRef; fallback: { prompt: string; references: ShotRef[] } };
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const pickView = (set: ImageSetValue, view: string): ShotRef[] => set.images.filter((i) => i.view === view).map((i) => ({ mediaId: i.mediaId, role: set.role }));

// Đồ vật trong khung: mô tả cho prompt (mọi món) + ảnh mẫu đúng trạng thái đầu (tối đa MAX_PROP_REFS, ưu tiên món đổi trạng thái).
function propsInFrame(shot: Shot, props: PropSetValue | undefined): { described: KeyframeCtx["props"]; refs: ShotRef[]; captions: string[] } {
  const uses = parsePropLines(shot.props).items;
  const described = uses.map((u) => ({ name: u.name, state: u.from, description: props?.items.find((p) => same(p.name, u.name))?.description ?? "" }));
  const ordered = [...uses].sort((a, b) => Number(Boolean(b.to && !same(b.to, b.from))) - Number(Boolean(a.to && !same(a.to, a.from))));
  const refs: ShotRef[] = [];
  const captions: string[] = [];
  for (const u of ordered) {
    if (refs.length >= MAX_PROP_REFS) break;
    const img = props?.items.find((p) => same(p.name, u.name))?.images.find((x) => same(x.state, u.from));
    if (!img) continue;
    refs.push({ mediaId: img.mediaId, role: "prop" });
    captions.push(`${u.name} (${u.from})`);
  }
  return { described, refs, captions };
}

// Ảnh khung: có người → nối tiếp trong chat phụ của nhân vật; không người → chat mới, đính kèm bối cảnh + đồ vật.
export function keyframeStep(a: ShotInputs): KeyframeStep {
  const { shot, providerId, character, location, props } = a;
  const look = location.look ?? DEFAULT_LOOK;
  const locationRef = pickView(location, "wide");
  const inFrame = propsInFrame(shot, props);
  const base: Omit<KeyframeCtx, "refs" | "inChat"> = { look, location: location.description, props: inFrame.described, character: character.description };
  const refs = [...locationRef, ...inFrame.refs];
  const captions = [...locationRef.map(() => "bối cảnh"), ...inFrame.captions];
  const face = pickView(character, "face");
  const front = pickView(character, "front");
  const personRefs = [...face, ...front, ...refs];
  const personCaptions = [...face.map(() => "nhân vật (mặt)"), ...front.map(() => "nhân vật (toàn thân)"), ...captions];
  const chat = character.session;
  if (shot.subject !== "none" && chat) {
    const prompt = keyframePrompt(shot, { ...base, refs: captions, inChat: true });
    const fallback = { prompt: keyframePrompt(shot, { ...base, refs: personCaptions, inChat: false }), references: personRefs };
    return {
      keyParts: ["keyframe", providerId, "chat", prompt, character.images.map((x) => x.mediaId), refs.map((r) => r.mediaId)],
      prompt,
      references: refs,
      chat: { session: chat, fallback },
    };
  }
  const withPerson = shot.subject !== "none";
  const references = withPerson ? personRefs : refs;
  const prompt = keyframePrompt(shot, { ...base, refs: withPerson ? personCaptions : captions, inChat: false });
  return { keyParts: ["keyframe", providerId, "new", prompt, references.map((r) => r.mediaId)], prompt, references };
}

// Clip từ ảnh khung (hoặc khung cuối cảnh trước).
export function clipStep(shot: Shot, providerId: string, character: ImageSetValue, keyframeMediaId: string): { keyParts: unknown[]; prompt: string } {
  const prompt = motionPrompt(shot, { character: character.description });
  return { keyParts: ["clip", providerId, prompt, keyframeMediaId, SHOT_SECONDS], prompt };
}

// Cảnh chữ→video (textOnly()).
export function textClipStep(shot: Shot, providerId: string, location: ImageSetValue): { keyParts: unknown[]; prompt: string } {
  const prompt = textVideoPrompt(shot, { look: location.look ?? DEFAULT_LOOK, location: location.description });
  return { keyParts: ["clip-text", providerId, prompt, SHOT_SECONDS], prompt };
}

// Khung cuối của clip: cùng khoá với khung đầu của cảnh nối phía sau (ffmpeg, không gọi dịch vụ).
export const chainFrameKey = (clipId: string): unknown[] => ["chain-frame", clipId];

// Ảnh xem trước của cảnh chữ→video: rút từ clip (ffmpeg, không gọi dịch vụ).
export const thumbKey = (clipId: string): unknown[] => ["thumb", clipId];

export type ShotCacheInputs = { providerId: string; character?: ImageSetValue; location?: ImageSetValue; props?: PropSetValue; prevClipId?: string };

// Một cảnh nhìn từ cache bước con, đi đúng đường makeShot() sẽ đi. `step` trả giá trị đã lưu (undefined: chưa có).
// calls: số lần gọi dịch vụ còn thiếu; thiếu Nhân vật/Không gian (node phía trước sẽ chạy) hoặc chưa biết khung đầu thì coi
// như phải tạo (ước dư, không ước thiếu). keyframeId/clipId: ảnh khung (cảnh chữ→video: ảnh xem trước) và clip khi đã có sẵn.
export function shotFromCache(shot: Shot, a: ShotCacheInputs, step: (keyParts: unknown) => unknown): { calls: Calls; keyframeId?: string; clipId?: string } {
  if (textOnly(shot)) {
    const clipId = a.location ? mediaIdOf(step(textClipStep(shot, a.providerId, a.location).keyParts)) : undefined;
    const keyframeId = clipId === undefined ? undefined : mediaIdOf(step(thumbKey(clipId)));
    return { calls: { image: 0, video: clipId === undefined ? 1 : 0, text: 0 }, keyframeId, clipId };
  }
  let image = 0;
  let keyframeId: string | undefined;
  if (shot.link === "chain") {
    keyframeId = a.prevClipId === undefined ? undefined : mediaIdOf(step(chainFrameKey(a.prevClipId)));
  } else {
    keyframeId = a.character && a.location ? mediaIdOf(step(keyframeStep({ shot, providerId: a.providerId, character: a.character, location: a.location, props: a.props }).keyParts)) : undefined;
    if (keyframeId === undefined) image = 1;
  }
  const clipId = keyframeId !== undefined && a.character ? mediaIdOf(step(clipStep(shot, a.providerId, a.character, keyframeId).keyParts)) : undefined;
  return { calls: { image, video: clipId === undefined ? 1 : 0, text: 0 }, keyframeId, clipId };
}

// Cả chuỗi cảnh (Dựng phim): cảnh nối lấy clip cảnh trước nếu đã có sẵn, chưa có thì 1 video.
export function shotListCalls(shots: Shot[], a: Omit<ShotCacheInputs, "prevClipId">, step: (keyParts: unknown) => unknown): Calls {
  let prevClipId: string | undefined;
  const total: Calls = { image: 0, video: 0, text: 0 };
  for (const shot of shots) {
    const r = shotFromCache(shot, { ...a, prevClipId }, step);
    total.image += r.calls.image;
    total.video += r.calls.video;
    prevClipId = r.clipId;
  }
  return total;
}
