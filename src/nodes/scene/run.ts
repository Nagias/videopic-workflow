import { optionalInput, requireInput, type NodeRun, type NodeRunContext } from "../../core/node-runtime";
import { checkShotList, type Shot } from "../../shared/director";
import type { ImageValue } from "../../shared/ports";
import { lastFrameOf, makeShot } from "../film/shot-steps";
import { sceneShot, type SceneParams } from "./definition";

const imageOf = (ctx: NodeRunContext, mediaId: string): ImageValue => {
  const rec = ctx.storage.getMedia(mediaId);
  if (!rec) throw new Error(`Không tìm thấy ảnh ${mediaId}`);
  if (rec.width === null || rec.height === null) throw new Error(`Ảnh ${mediaId} chưa có kích thước`);
  return { kind: "image", mediaId, width: rec.width, height: rec.height };
};

export const run: NodeRun<SceneParams> = async (ctx, inputs, params) => {
  const character = requireInput(inputs, "character", "imageset");
  const location = requireInput(inputs, "location", "imageset");
  const props = optionalInput(inputs, "props", "props");
  const follow = optionalInput(inputs, "follow", "video");

  const shot = sceneShot(params, follow !== undefined);
  // Luật của riêng cảnh này (chữ, đồ vật) kiểm trước khi tốn lượt. Luật giữa các cảnh (nối, trạng thái đồ vật liên tục)
  // do Ghép phim kiểm trên cả chuỗi; cảnh nối được kiểm như cảnh cắt có khung đầu là khung cuối cảnh trước.
  const known = props?.items.map((p) => ({ name: p.name, states: p.images.map((x) => x.state) }));
  const alone: Shot = follow ? { ...shot, link: "cut", start: shot.start.trim() || "khung cuối cảnh trước" } : shot;
  const errors = checkShotList([alone], known).errors.map((e) => e.replace(/^Cảnh 1: /, ""));
  if (errors.length) throw new Error(errors.join("; "));

  const done = await makeShot(ctx, {
    shot,
    provider: ctx.providers.get(params.provider),
    character,
    location,
    ...(props ? { props } : {}),
    ...(follow ? { prevClipId: follow.mediaId } : {}),
    measure: true,
    onKeyframe: (keyframeId) => ctx.partial({ frame: imageOf(ctx, keyframeId) }),
  });
  const last = await lastFrameOf(ctx, done.clipId);
  const clip = ctx.storage.getMedia(done.clipId);
  if (!clip) throw new Error(`Không tìm thấy clip ${done.clipId}`);
  // Như mọi video khác: thời lượng và kích thước thật của file. Phần dùng khi ghép do nơi ghép tự tính (xem ports.ts).
  const probe = await ctx.ffmpeg.probeVideo(ctx.storage.absPath(clip));
  ctx.report(`Xong: clip ${probe.durationSec.toFixed(1)} giây`);
  return {
    clip: {
      kind: "video",
      mediaId: done.clipId,
      durationSec: probe.durationSec,
      width: probe.width,
      height: probe.height,
      clip: { trimStartSec: done.trimStartSec, hasAudio: done.hasAudio, ...(done.brightness ? { brightness: done.brightness } : {}) },
    },
    frame: imageOf(ctx, done.keyframeId),
    last: imageOf(ctx, last.mediaId),
  };
};
