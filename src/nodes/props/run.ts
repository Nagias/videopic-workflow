import { optionalInput, type NodeRun } from "../../core/node-runtime";
import { semaphore } from "../../core/semaphore";
import type { ChatSessionRef } from "../../providers/types";
import type { PropItem, PropSetValue } from "../../shared/ports";
import { DEFAULT_LOOK, propStatePrompt, propStillPrompt } from "../../shared/prompts";
import { checkSpec, rowsToSpec, type PropsParams } from "./definition";

export const run: NodeRun<PropsParams> = async (ctx, inputs, params) => {
  const fromWriter = optionalInput(inputs, "spec", "propspec");
  const spec = checkSpec(fromWriter ? fromWriter.items : rowsToSpec(params.items), { allowEmpty: fromWriter !== undefined });
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
        for (const [idx, state] of item.states.entries()) {
          const base = items[k]!.images[0];
          const inChat = idx > 0 && session !== undefined;
          const prompt = idx === 0 ? propStillPrompt(item, DEFAULT_LOOK) : propStatePrompt(item, state, DEFAULT_LOOK);
          ctx.report(`Ảnh mẫu đồ vật: ${item.name} (${state})…`);
          // Khoá theo mô tả món đồ (không theo node): món giống hệt ở workflow khác dùng lại ảnh, không tốn lượt.
          const img = await ctx.step(["prop", provider.id, item.name, item.description, item.states.slice(0, idx + 1), DEFAULT_LOOK], async () => {
            const r = await provider.generateImage(
              {
                prompt,
                references: inChat || !base ? [] : [{ mediaId: base.mediaId, role: "prop" }],
                session: inChat ? session : "new",
                fallback: base ? { prompt: propStatePrompt(item, state, DEFAULT_LOOK, true), references: [{ mediaId: base.mediaId, role: "prop" }] } : undefined,
                verbatim: true,
              },
              { signal: ctx.signal, report: (m) => ctx.report(`${item.name}: ${m}`), storage: ctx.storage, ffmpeg: ctx.ffmpeg },
            );
            return { mediaId: r.mediaId, accountId: r.session?.accountId ?? "", threadUrl: r.session?.threadUrl ?? "" };
          });
          if (img.threadUrl) session = { accountId: img.accountId, threadUrl: img.threadUrl };
          items[k]!.images.push({ mediaId: img.mediaId, state });
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
