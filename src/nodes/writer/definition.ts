import { z } from "zod";
import { BATCH_SIZE } from "../../shared/cartoon-prompts";
import { defineNode, type PreflightCtx, type PreflightIssue } from "../../shared/node-definition";
import { pickInput } from "../../shared/ports";
import { codeVersion, repairPrompt, writerPrompt } from "../../shared/prompts";
import { PROVIDER_IDS } from "../../shared/providers";
import { styleMismatch } from "../../shared/style-check";
import { isCartoon } from "../../shared/styles";

export const WRITER_MAX_TRIES = 3;
export const WRITER_MAX_SHOTS = 36;
export const IDEA_MIN = 20;

export const params = z.object({
  // Bắt buộc ≥ IDEA_MIN chữ khi không nối Dàn ý (kiểm trước khi chạy, xem preflight); nối Dàn ý thì Biên kịch bám dàn ý.
  idea: z.string().trim(),
  shotCount: z.number().int().min(4, "Ít nhất 4 cảnh").max(WRITER_MAX_SHOTS, `Nhiều nhất ${WRITER_MAX_SHOTS} cảnh (3 phút)`),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
});
export type WriterParams = z.infer<typeof params>;

export const IDEA_TOO_SHORT = "Ý tưởng quá ngắn (cần ai, ở đâu, làm gì)";

function writerPreflight(ctx: PreflightCtx): PreflightIssue[] {
  const p = ctx.node.params as WriterParams;
  const hasOutline = ctx.sources(ctx.node.node.id, "outline").length > 0;
  return [...styleMismatch(ctx), ...(!hasOutline && p.idea.trim().length < IDEA_MIN ? [IDEA_TOO_SHORT] : [])];
}

// Số đợt Biên kịch hoạt hình (mỗi đợt ≤ BATCH_SIZE cảnh, mỗi đợt tối đa WRITER_MAX_TRIES lượt chữ).
export const batchCount = (shotCount: number) => Math.ceil(shotCount / BATCH_SIZE);

export const definition = defineNode<WriterParams>({
  type: "writer",
  label: "Biên kịch (AI)",
  description:
    "Nhờ chính chat Muse viết danh sách cảnh (khung đầu, chuyển động, đồ vật) và danh sách đồ vật từ một ý tưởng hoặc từ Dàn ý tập phim; tự kiểm luật đạo diễn, sai thì nhờ sửa. Nối Dàn nhân vật thì viết kiểu phim hoạt hình, từng đợt 12 cảnh.",
  inputs: [
    { name: "character", kind: "imageset", label: "Nhân vật", optional: true },
    { name: "location", kind: "imageset", label: "Không gian", optional: true },
    // Đồ vật có ảnh thật: Biên kịch chỉ được dùng đúng tên và trạng thái của nó (spec 2026-11-03 mục 3.4).
    { name: "product", kind: "props", label: "Sản phẩm", optional: true },
    // Dàn ý tập phim hoạt hình (thiết kế 2026-11-06): có thì số cảnh và mạch truyện theo dàn ý.
    { name: "outline", kind: "outline", label: "Dàn ý", optional: true },
  ],
  outputs: [
    { name: "shots", kind: "shotlist", label: "Cảnh" },
    { name: "props", kind: "propspec", label: "Danh sách đồ vật" },
  ],
  // Chỉ prompt người thật; prompt hoạt hình nằm trong cacheVersion của Dàn nhân vật (node phía trước), xem cartoon-prompts.ts.
  cacheVersion: codeVersion(writerPrompt, repairPrompt),
  params,
  defaults: { idea: "", shotCount: 12, provider: "fake" },
  preflight: writerPreflight,
  cardLine: (p, out, wires) => {
    const shots = out?.shots;
    if (shots?.kind !== "shotlist") return (wires?.outline ?? 0) > 0 ? "theo Dàn ý" : `${p.shotCount} cảnh dự kiến`;
    const items = out?.props;
    return `${shots.shots.length} cảnh · ${items?.kind === "propspec" ? items.items.length : 0} đồ vật`;
  },
  // Ước dư (spec mục 6.5): người thật 1 lượt viết + tối đa WRITER_MAX_TRIES − 1 lượt sửa. Hoạt hình (nối Dàn ý, hoặc Nhân vật
  // đã biết là Dàn nhân vật hoạt hình): mỗi đợt như vậy; dàn ý chưa biết thì tính theo độ dài tối đa.
  estimate: (p, connected, known) => {
    const character = known ? pickInput(known.inputs, "character", "imageset") : undefined;
    const outline = known ? pickInput(known.inputs, "outline", "outline") : undefined;
    if (connected.has("outline")) return { image: 0, video: 0, text: batchCount(outline?.shotCount ?? WRITER_MAX_SHOTS) * WRITER_MAX_TRIES };
    if (isCartoon(character?.style)) return { image: 0, video: 0, text: batchCount(p.shotCount) * WRITER_MAX_TRIES };
    return { image: 0, video: 0, text: WRITER_MAX_TRIES };
  },
});
