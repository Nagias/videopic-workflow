import type { ChatSessionRef, ImageReference } from "../providers/types";
import type { ProviderId } from "../shared/providers";
import type { ImageSetValue } from "../shared/ports";
import type { ReferenceView } from "../shared/prompts";
import type { NodeRunContext } from "./node-runtime";

// Bộ ảnh mẫu: ảnh đầu tạo từ mô tả trong một chat phụ mới, các ảnh sau tạo nối tiếp trong chính chat đó
// (Muse giữ mặt/nơi chốn tốt nhất khi nối tiếp, đo 27/10/2026). Chat hỏng → thử chat mới đính kèm ảnh đầu.
export async function generateReferenceSet(
  ctx: NodeRunContext,
  providerId: ProviderId,
  role: ImageSetValue["role"],
  description: string,
  views: ReferenceView[],
  look?: string,
): Promise<ImageSetValue> {
  const provider = ctx.providers.get(providerId);
  const set: ImageSetValue = { kind: "imageset", role, description, images: [], ...(look ? { look } : {}) };
  let session: ChatSessionRef | undefined;
  for (const v of views) {
    const anchor = set.images[0];
    const anchorRefs: ImageReference[] = anchor ? [{ mediaId: anchor.mediaId, role }] : [];
    const inChat = anchor !== undefined && v.inChatPrompt !== undefined && session !== undefined;
    const prompt = inChat ? v.inChatPrompt! : v.prompt;
    const references = inChat ? [] : anchorRefs;
    ctx.report(`Tạo ảnh mẫu: ${v.label}…`);
    const img = await ctx.step(["reference", providerId, role, v.view, prompt, anchorRefs.map((r) => r.mediaId)], async () => {
      const r = await provider.generateImage(
        {
          prompt,
          references,
          session: inChat ? session : "new",
          fallback: inChat ? { prompt: v.prompt, references: anchorRefs } : undefined,
          verbatim: true,
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
