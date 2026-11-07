import { MAX_PROP_REFS, parsePropLines, SHOT_SECONDS, textOnly, type Shot } from "./director";
import type { Calls } from "./node-definition";
import { mediaIdOf, mergePropSets, type ImageSetValue, type PropSetValue } from "./ports";
import { DEFAULT_LOOK, keyframePrompt, motionPrompt, productKeyframePrompt, productMotionPrompt, textVideoPrompt, type KeyframeCtx } from "./prompts";
import { cartoonKeyframePrompt, cartoonLook, cartoonMotionPrompt, castInShot } from "./cartoon-prompts";
import { isCartoon, type CartoonStyle } from "./styles";

// Khoá bước con (ctx.step) và yêu cầu gửi dịch vụ của từng bước tạo một cảnh. Một nơi duy nhất:
// makeShot() (src/nodes/film/shot-steps.ts) chạy theo đây, ước tính lượt của node Cảnh tra cache theo đây (shotCalls()).
// Dựng phim và Cảnh cùng stepScope "film": đổi mảng khoá ở đây là mất cache cũ của cả hai.

export type ShotRef = { mediaId: string; role: string };
type ChatRef = NonNullable<ImageSetValue["session"]>;

// product: đồ vật có ảnh thật (cổng Sản phẩm của Cảnh), gộp trước đồ phụ; không có thì mọi khoá và prompt y hệt bản trước.
export type ShotInputs = { shot: Shot; providerId: string; character: ImageSetValue; location: ImageSetValue; props?: PropSetValue; product?: PropSetValue };

export type KeyframeStep = {
  keyParts: unknown[];
  prompt: string;
  references: ShotRef[];
  // Có người và nhân vật có chat phụ: tạo trong chat đó; dịch vụ không tiếp tục được chat thì dùng fallback (chat mới).
  chat?: { session: ChatRef; fallback: { prompt: string; references: ShotRef[] } };
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const pickView = (set: ImageSetValue, view: string): ShotRef[] => set.images.filter((i) => i.view === view).map((i) => ({ mediaId: i.mediaId, role: set.role }));

// Cảnh có sản phẩm: trường đồ vật của cảnh có tên một món của node Sản phẩm.
export const productInShot = (shot: Shot, product: PropSetValue | undefined): boolean =>
  product !== undefined && parsePropLines(shot.props).items.some((u) => product.items.some((p) => same(p.name, u.name)));

// Đồ vật trong khung: mô tả cho prompt (mọi món) + ảnh mẫu đúng trạng thái đầu (tối đa MAX_PROP_REFS; ưu tiên sản phẩm, rồi món đổi trạng thái).
function propsInFrame(shot: Shot, props: PropSetValue | undefined, product?: PropSetValue): { described: KeyframeCtx["props"]; refs: ShotRef[]; captions: string[] } {
  const uses = parsePropLines(shot.props).items;
  const described = uses.map((u) => ({ name: u.name, state: u.from, description: props?.items.find((p) => same(p.name, u.name))?.description ?? "" }));
  const isProduct = (name: string) => Number(product?.items.some((p) => same(p.name, name)) ?? false);
  const changes = (u: (typeof uses)[number]) => Number(Boolean(u.to && !same(u.to, u.from)));
  const ordered = [...uses].sort((a, b) => isProduct(b.name) - isProduct(a.name) || changes(b) - changes(a));
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

// Cảnh chữ → video: như textOnly(), trừ phim hoạt hình (luôn vẽ ảnh khung từ ảnh bối cảnh để bối cảnh giữ đúng; cảnh có trường
// cast là cảnh Biên kịch hoạt hình viết, kể cả khi chưa biết Nhân vật lúc ước tính).
export const textOnlyShot = (shot: Shot, character: ImageSetValue | undefined): boolean => textOnly(shot) && shot.cast === undefined && !isCartoon(character?.style);

// Tông của cảnh hoạt hình: bối cảnh cùng phong cách thì dùng tông của nó (đã gồm câu phong cách), không thì câu phong cách.
const cartoonFrameLook = (style: CartoonStyle, location: ImageSetValue) => (location.style === style && location.look ? location.look : cartoonLook(style));

// Ảnh khung hoạt hình (thiết kế 2026-11-06): chat mới, đính kèm ảnh cả dàn đúng tỉ lệ + từng nhân vật có mặt (tối đa 3,
// đông hơn thì chỉ ảnh cả dàn) + bối cảnh + đồ vật.
function cartoonKeyframeStep(a: ShotInputs, style: CartoonStyle): KeyframeStep {
  const { shot, providerId, character, location, product } = a;
  const members = character.members ?? [];
  const props = mergePropSets(product, a.props);
  const inFrame = propsInFrame(shot, props, product);
  const { present } = castInShot(shot, members);
  const people: ShotRef[] = [];
  const captions: string[] = [];
  if (present.length) {
    for (const r of pickView(character, "front")) {
      people.push(r);
      captions.push("cả dàn nhân vật, đúng tỉ lệ kích thước");
    }
    if (present.length <= 3) {
      for (const m of present) {
        const idx = members.indexOf(m);
        for (const r of pickView(character, `member-${idx + 1}`)) {
          people.push(r);
          captions.push(m.name);
        }
      }
    }
  }
  const locationRef = pickView(location, "wide");
  const references = [...people, ...locationRef, ...inFrame.refs];
  const refCaptions = [...captions, ...locationRef.map(() => "bối cảnh"), ...inFrame.captions];
  const prompt = cartoonKeyframePrompt(shot, { members, look: cartoonFrameLook(style, location), location: location.description, props: inFrame.described, refs: refCaptions });
  return { keyParts: ["keyframe-cartoon", providerId, prompt, references.map((r) => r.mediaId)], prompt, references };
}

// Ảnh khung: có người → nối tiếp trong chat phụ của nhân vật; không người → chat mới, đính kèm bối cảnh + đồ vật.
export function keyframeStep(a: ShotInputs): KeyframeStep {
  if (isCartoon(a.character.style)) return cartoonKeyframeStep(a, a.character.style);
  const { shot, providerId, character, location, product } = a;
  const props = mergePropSets(product, a.props);
  const framePrompt = productInShot(shot, product) ? productKeyframePrompt : keyframePrompt;
  const look = location.look ?? DEFAULT_LOOK;
  const locationRef = pickView(location, "wide");
  const inFrame = propsInFrame(shot, props, product);
  const base: Omit<KeyframeCtx, "refs" | "inChat"> = { look, location: location.description, props: inFrame.described, character: character.description };
  const refs = [...locationRef, ...inFrame.refs];
  const captions = [...locationRef.map(() => "bối cảnh"), ...inFrame.captions];
  const face = pickView(character, "face");
  const front = pickView(character, "front");
  const personRefs = [...face, ...front, ...refs];
  const personCaptions = [...face.map(() => "nhân vật (mặt)"), ...front.map(() => "nhân vật (toàn thân)"), ...captions];
  const chat = character.session;
  if (shot.subject !== "none" && chat) {
    const prompt = framePrompt(shot, { ...base, refs: captions, inChat: true });
    const fallback = { prompt: framePrompt(shot, { ...base, refs: personCaptions, inChat: false }), references: personRefs };
    return {
      keyParts: ["keyframe", providerId, "chat", prompt, character.images.map((x) => x.mediaId), refs.map((r) => r.mediaId)],
      prompt,
      references: refs,
      chat: { session: chat, fallback },
    };
  }
  const withPerson = shot.subject !== "none";
  const references = withPerson ? personRefs : refs;
  const prompt = framePrompt(shot, { ...base, refs: withPerson ? personCaptions : captions, inChat: false });
  return { keyParts: ["keyframe", providerId, "new", prompt, references.map((r) => r.mediaId)], prompt, references };
}

// Clip từ ảnh khung (hoặc khung cuối cảnh trước). Cảnh có sản phẩm: prompt video giữ chữ/logo in trên sản phẩm.
export function clipStep(shot: Shot, providerId: string, character: ImageSetValue, keyframeMediaId: string, product?: PropSetValue): { keyParts: unknown[]; prompt: string } {
  if (isCartoon(character.style)) {
    const cartoon = cartoonMotionPrompt(shot, { members: character.members ?? [] });
    return { keyParts: ["clip", providerId, cartoon, keyframeMediaId, SHOT_SECONDS], prompt: cartoon };
  }
  const prompt = (productInShot(shot, product) ? productMotionPrompt : motionPrompt)(shot, { character: character.description });
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

export type ShotCacheInputs = { providerId: string; character?: ImageSetValue; location?: ImageSetValue; props?: PropSetValue; product?: PropSetValue; prevClipId?: string };

// Một cảnh nhìn từ cache bước con, đi đúng đường makeShot() sẽ đi. `step` trả giá trị đã lưu (undefined: chưa có).
// calls: số lần gọi dịch vụ còn thiếu; thiếu Nhân vật/Không gian (node phía trước sẽ chạy) hoặc chưa biết khung đầu thì coi
// như phải tạo (ước dư, không ước thiếu). keyframeId/clipId: ảnh khung (cảnh chữ→video: ảnh xem trước) và clip khi đã có sẵn.
export function shotFromCache(shot: Shot, a: ShotCacheInputs, step: (keyParts: unknown) => unknown): { calls: Calls; keyframeId?: string; clipId?: string } {
  if (textOnlyShot(shot, a.character)) {
    const clipId = a.location ? mediaIdOf(step(textClipStep(shot, a.providerId, a.location).keyParts)) : undefined;
    const keyframeId = clipId === undefined ? undefined : mediaIdOf(step(thumbKey(clipId)));
    return { calls: { image: 0, video: clipId === undefined ? 1 : 0, text: 0 }, keyframeId, clipId };
  }
  let image = 0;
  let keyframeId: string | undefined;
  if (shot.link === "chain") {
    keyframeId = a.prevClipId === undefined ? undefined : mediaIdOf(step(chainFrameKey(a.prevClipId)));
  } else {
    keyframeId = a.character && a.location ? mediaIdOf(step(keyframeStep({ shot, providerId: a.providerId, character: a.character, location: a.location, props: a.props, product: a.product }).keyParts)) : undefined;
    if (keyframeId === undefined) image = 1;
  }
  const clipId = keyframeId !== undefined && a.character ? mediaIdOf(step(clipStep(shot, a.providerId, a.character, keyframeId, a.product).keyParts)) : undefined;
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
