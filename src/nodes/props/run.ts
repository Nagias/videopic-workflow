import { optionalInput, type NodeRun } from "../../core/node-runtime";
import { semaphore } from "../../core/semaphore";
import type { ChatSessionRef, ImageReference } from "../../providers/types";
import type { PropItem, PropSetValue, PropSpecItem } from "../../shared/ports";
import { DEFAULT_LOOK, productFromPhotoPrompt, productStatePrompt, propStatePrompt, propStillPrompt } from "../../shared/prompts";
import { checkSpec, planItem, rowOf, specOf, type PropsParams } from "./definition";

// Prompt và ảnh đính kèm của một lần vẽ. Món không có ảnh thật: ảnh tĩnh vật trạng thái đầu, các trạng thái sau nối tiếp trong
// chat (hỏng chat thì chat mới đính kèm ảnh đầu). Món có ảnh thật: lần vẽ đầu chat mới đính kèm ảnh thật, các lần sau nối tiếp.
function drawRequest(item: PropSpecItem, state: string, base: string[], first: boolean, firstImage: string | undefined) {
  const look = DEFAULT_LOOK;
  if (base.length) {
    const refs: ImageReference[] = base.map((mediaId) => ({ mediaId, role: "prop" }));
    return first
      ? { prompt: productFromPhotoPrompt(item, state, look), references: refs, fallback: undefined }
      : { prompt: productStatePrompt(item, state, look), references: refs, fallback: { prompt: productStatePrompt(item, state, look, true), references: refs } };
  }
  const anchor: ImageReference[] = firstImage ? [{ mediaId: firstImage, role: "prop" }] : [];
  return first
    ? { prompt: propStillPrompt(item, look), references: anchor, fallback: undefined }
    : {
        prompt: propStatePrompt(item, state, look),
        references: anchor,
        fallback: firstImage ? { prompt: propStatePrompt(item, state, look, true), references: anchor } : undefined,
      };
}

export const run: NodeRun<PropsParams> = async (ctx, inputs, params) => {
  const fromWriter = optionalInput(inputs, "spec", "propspec");
  const spec = checkSpec(specOf(params, fromWriter), { allowEmpty: fromWriter !== undefined });
  const provider = ctx.providers.get(params.provider);
  const sem = semaphore(Math.max(1, provider.maxParallel()));
  const items: PropItem[] = spec.map((s) => ({ name: s.name, description: s.description, images: [] }));
  const publish = () => ctx.partial({ props: { kind: "props", items: items.map((i) => ({ ...i, images: [...i.images] })) } });

  // allSettled: một món lỗi không bỏ rơi các món khác đang chạy (ảnh của chúng vẫn vào cache để lần sau dùng lại).
  const settled = await Promise.allSettled(
    spec.map(async (item, k) => {
      await sem.acquire();
      try {
        let session: ChatSessionRef | undefined;
        let firstImage: string | undefined;
        let drawn = 0;
        for (const s of planItem(provider.id, item, rowOf(params, item, fromWriter !== undefined))) {
          if ("photos" in s) {
            items[k]!.images.push(...s.photos.map((mediaId) => ({ mediaId, state: s.state })));
            publish();
            continue;
          }
          const first = drawn === 0;
          const inChat = !first && session !== undefined;
          const req = drawRequest(item, s.state, s.draw.base, first, firstImage);
          ctx.report(`Ảnh mẫu đồ vật: ${item.name} (${s.state})…`);
          const img = await ctx.step(s.draw.key, async () => {
            const r = await provider.generateImage(
              {
                prompt: req.prompt,
                references: inChat ? [] : req.references,
                session: inChat ? session : "new",
                fallback: req.fallback,
                verbatim: true,
              },
              { signal: ctx.signal, report: (m) => ctx.report(`${item.name}: ${m}`), storage: ctx.storage, ffmpeg: ctx.ffmpeg },
            );
            return { mediaId: r.mediaId, accountId: r.session?.accountId ?? "", threadUrl: r.session?.threadUrl ?? "" };
          });
          drawn++;
          firstImage ??= img.mediaId;
          if (img.threadUrl) session = { accountId: img.accountId, threadUrl: img.threadUrl };
          items[k]!.images.push({ mediaId: img.mediaId, state: s.state });
          publish();
        }
      } finally {
        sem.release();
      }
    }),
  );
  const failed = settled
    .map((r, k) => (r.status === "rejected" ? `${spec[k]!.name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}` : null))
    .filter(Boolean);
  if (failed.length) throw new Error(`${failed.length}/${spec.length} đồ vật chưa xong (các món đã xong được giữ, bấm Chạy để làm tiếp). ${failed.join(" | ")}`);
  const out: PropSetValue = { kind: "props", items };
  return { props: out };
};
