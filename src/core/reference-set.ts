import type { ChatSessionRef, ImageReference } from "../providers/types";
import type { ProviderId } from "../shared/providers";
import type { ImageSetValue } from "../shared/ports";
import type { NodeRunContext } from "./node-runtime";

import type { ReferenceView } from "../shared/prompts";

export type ReferenceMode = "chat" | "attach";

export async function generateReferenceSet(
  ctx: NodeRunContext,
  providerId: ProviderId,
  role: ImageSetValue["role"],
  description: string,
  views: ReferenceView[],
  mode: ReferenceMode,
): Promise<ImageSetValue> {
  const provider = ctx.providers.get(providerId);
  const set: ImageSetValue = { kind: "imageset", role, description, images: [] };
  let session: ChatSessionRef | undefined;
  for (const v of views) {
    const anchor = set.images[0];
    const anchorRefs: ImageReference[] = anchor ? [{ mediaId: anchor.mediaId, role }] : [];
    const inChat = mode === "chat" && anchor !== undefined && v.inChatPrompt !== undefined && session !== undefined;
    const prompt = inChat ? v.inChatPrompt! : v.prompt;
    const references = inChat ? [] : anchorRefs;
    ctx.report(`Tạo ảnh hồ sơ: ${v.label}…`);
    const img = await ctx.step(["reference", providerId, role, mode, v.view, prompt, anchorRefs.map((r) => r.mediaId)], async () => {
      const r = await provider.generateImage(
        {
          prompt,
          references,
          session: mode === "chat" ? (session ?? "new") : undefined,
          fallback: inChat ? { prompt: v.prompt, references: anchorRefs } : undefined,
        },
        { signal: ctx.signal, report: (m) => ctx.report(`${v.label}: ${m}`), storage: ctx.storage, ffmpeg: ctx.ffmpeg },
      );
      return { mediaId: r.mediaId, accountId: r.session?.accountId ?? "", threadUrl: r.session?.threadUrl ?? "" };
    });
    if (img.threadUrl) session = { accountId: img.accountId, threadUrl: img.threadUrl };
    set.images.push({ mediaId: img.mediaId, view: v.view });
    if (session) set.session = session;
    ctx.partial({ [role === "character" ? "character" : "location"]: set });
  }
  return set;
}
