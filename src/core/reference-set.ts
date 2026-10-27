import type { ProviderId } from "../shared/providers";
import type { ImageSetValue } from "../shared/ports";
import type { NodeRunContext } from "./node-runtime";

export type ReferenceView = { view: string; prompt: string; label: string };

export async function generateReferenceSet(
  ctx: NodeRunContext,
  providerId: ProviderId,
  role: ImageSetValue["role"],
  description: string,
  views: ReferenceView[],
): Promise<ImageSetValue> {
  const provider = ctx.providers.get(providerId);
  const set: ImageSetValue = { kind: "imageset", role, description, images: [] };
  for (const v of views) {
    const anchor = set.images[0];
    const references = anchor ? [{ mediaId: anchor.mediaId, role }] : [];
    ctx.report(`Tạo ảnh hồ sơ: ${v.label}…`);
    const img = await ctx.step(["reference", providerId, role, v.view, v.prompt, references], async () => {
      const r = await provider.generateImage(
        { prompt: v.prompt, references },
        { signal: ctx.signal, report: (m) => ctx.report(`${v.label}: ${m}`), storage: ctx.storage, ffmpeg: ctx.ffmpeg },
      );
      return { mediaId: r.mediaId };
    });
    set.images.push({ mediaId: img.mediaId, view: v.view });
    ctx.partial({ [role === "character" ? "character" : "location"]: set });
  }
  return set;
}
