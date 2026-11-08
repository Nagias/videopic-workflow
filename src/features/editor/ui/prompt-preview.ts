import { propStates, type ImageSetValue, type NodeOutputs, type PropSetValue, type PropSpecItem } from "../../../shared/ports";
import { productWriterPrompt } from "../../../shared/prompts";
import { BATCH_SIZE, castDescription, episodeWriterPrompt } from "../../../shared/cartoon-prompts";
import { CastMemberSchema } from "../../../shared/cast";
import { isCartoon, styleOf } from "../../../shared/styles";
import { lookOf } from "../../../nodes/location/definition";
import { z } from "zod";

const CastMembersSchema = z.array(CastMemberSchema);
import { clipStep, keyframeStep, textClipStep, textOnlyShot } from "../../../shared/shot-plan";
import { definition as sceneDefinition, sceneShot, type SceneParams } from "../../../nodes/scene/definition";
import { definition as writerDefinition } from "../../../nodes/writer/definition";

// Tab "Prompt gửi Muse" của khung bên phải (chỉ đọc): dựng lại đúng chữ máy chủ sẽ gửi, bằng chính các hàm dựng prompt dùng chung
// (src/shared/shot-plan.ts, src/shared/prompts.ts) — không viết lại chữ prompt ở đây. Đầu vào lấy từ kết quả lần chạy của node
// nguồn nếu đã có (cả ảnh mẫu và chat), chưa có thì từ tham số node nguồn (mô tả); chưa nối dây thì để chỗ trống nói rõ.

export const PROMPT_AT_RUN = "Prompt được tạo khi chạy";

export type PromptSection = { title: string; text: string };
// sections: chữ prompt thật sẽ gửi. notes: lời giải thích cho người đọc (không phải chữ gửi đi).
export type PromptPreview = { sections: PromptSection[]; notes?: string[] } | { note: string };

type PreviewNode = { id: string; type?: string; data: { params: Record<string, unknown> } };
type PreviewWire = { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null };

const MISSING_CHARACTER = "(chưa nối Nhân vật)";
const MISSING_LOCATION = "(chưa nối Không gian)";
const NO_DESCRIPTION = "(chưa có mô tả)";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

type Source = { node: PreviewNode; port: string };

function sourceOf(nodeId: string, port: string, nodes: readonly PreviewNode[], edges: readonly PreviewWire[]): Source | undefined {
  const edge = edges.find((e) => e.target === nodeId && e.targetHandle === port);
  const node = edge ? nodes.find((n) => n.id === edge.source) : undefined;
  return edge && node ? { node, port: edge.sourceHandle ?? "" } : undefined;
}

function imageSetOf(src: Source | undefined, role: ImageSetValue["role"], missing: string, outputOf: (id: string) => NodeOutputs | null | undefined): ImageSetValue {
  if (!src) return { kind: "imageset", role, description: missing, images: [] };
  const real = outputOf(src.node.id)?.[src.port];
  if (real?.kind === "imageset") return real;
  const p = src.node.data.params;
  // Dàn nhân vật chưa chạy: dựng từ tham số như node sẽ ra (phong cách, dàn, luật), để xem trước đúng prompt hoạt hình.
  if (src.node.type === "cast") {
    const members = CastMembersSchema.safeParse(p.members);
    const style = styleOf(str(p.style));
    const list = members.success ? members.data : [];
    return { kind: "imageset", role, description: castDescription(list) || NO_DESCRIPTION, images: [], members: list, rules: str(p.rules), ...(isCartoon(style) ? { style } : {}) };
  }
  const look = src.node.type === "location" ? lookOf({ look: str(p.look), style: styleOf(str(p.style)) }) : str(p.look).trim();
  const style = styleOf(str(p.style));
  return { kind: "imageset", role, description: str(p.description).trim() || NO_DESCRIPTION, images: [], ...(look ? { look } : {}), ...(isCartoon(style) ? { style } : {}) };
}

function propsOf(src: Source | undefined, outputOf: (id: string) => NodeOutputs | null | undefined): PropSetValue | undefined {
  if (!src) return undefined;
  const real = outputOf(src.node.id)?.[src.port];
  if (real?.kind === "props") return real;
  const rows = src.node.data.params.items;
  if (!Array.isArray(rows)) return undefined;
  return {
    kind: "props",
    items: rows.map((r: unknown) => {
      const row = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
      return { name: str(row.name), description: str(row.description), images: [] };
    }),
  };
}

// Sản phẩm nối vào Biên kịch, dạng máy chủ đưa vào prompt (writer/run.ts): đã chạy thì trạng thái theo ảnh, chưa chạy thì theo chữ gõ.
function productSpecOf(src: Source | undefined, outputOf: (id: string) => NodeOutputs | null | undefined): PropSpecItem[] {
  if (!src) return [];
  const real = outputOf(src.node.id)?.[src.port];
  if (real?.kind === "props") return real.items.map((i) => ({ name: i.name, description: i.description, states: propStates(i) }));
  const rows = src.node.data.params.items;
  if (!Array.isArray(rows)) return [];
  return rows.map((row: unknown) => {
    const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return { name: str(r.name).trim(), description: str(r.description).trim(), states: str(r.states).split(",").map((x) => x.trim()).filter(Boolean) };
  });
}

function scenePreview(node: PreviewNode, nodes: readonly PreviewNode[], edges: readonly PreviewWire[], outputOf: (id: string) => NodeOutputs | null | undefined): PromptPreview {
  const p = { ...sceneDefinition.defaults, ...node.data.params } as SceneParams;
  const follows = sourceOf(node.id, "follow", nodes, edges) !== undefined;
  const shot = sceneShot(p, follows);
  const character = imageSetOf(sourceOf(node.id, "character", nodes, edges), "character", MISSING_CHARACTER, outputOf);
  const location = imageSetOf(sourceOf(node.id, "location", nodes, edges), "location", MISSING_LOCATION, outputOf);
  if (textOnlyShot(shot, character)) {
    return { sections: [{ title: "Prompt video (chữ → video, không có ảnh khung)", text: textClipStep(shot, p.provider, location).prompt }] };
  }
  const props = propsOf(sourceOf(node.id, "props", nodes, edges), outputOf);
  const product = propsOf(sourceOf(node.id, "product", nodes, edges), outputOf);
  const clip: PromptSection = { title: "Prompt video (gửi kèm ảnh khung đầu)", text: clipStep(shot, p.provider, character, "", product, props).prompt };
  if (shot.link === "chain") {
    return { sections: [clip], notes: ["Khung đầu: lấy khung cuối của clip cảnh trước nối vào, không gửi prompt tạo ảnh."] };
  }
  const frame = keyframeStep({ shot, providerId: p.provider, character, location, ...(props ? { props } : {}), ...(product ? { product } : {}) });
  return { sections: [{ title: "Prompt tạo ảnh khung đầu", text: frame.prompt }, clip] };
}

function writerPreview(node: PreviewNode, nodes: readonly PreviewNode[], edges: readonly PreviewWire[], outputOf: (id: string) => NodeOutputs | null | undefined): PromptPreview {
  const p = node.data.params;
  const sourceCharacter = sourceOf(node.id, "character", nodes, edges);
  const sourceLocation = sourceOf(node.id, "location", nodes, edges);
  // Như máy chủ đọc tham số qua zod: ý tưởng được cắt khoảng trắng hai đầu, thiếu số cảnh thì lấy mặc định của node.
  const count = typeof p.shotCount === "number" ? p.shotCount : writerDefinition.defaults.shotCount;
  // Phim hoạt hình: lời đầu của đợt 1 (các đợt sau hỏi tiếp trong cùng chat, xem writer/run.ts).
  const cast = sourceCharacter ? imageSetOf(sourceCharacter, "character", MISSING_CHARACTER, outputOf) : undefined;
  if (cast && isCartoon(cast.style)) {
    const outlineSrc = sourceOf(node.id, "outline", nodes, edges);
    const outline = outlineSrc ? outputOf(outlineSrc.node.id)?.[outlineSrc.port] : undefined;
    const story = outline?.kind === "outline" ? outline.text : outlineSrc ? "(dàn ý — có sau khi node Dàn ý chạy)" : str(p.idea).trim();
    const shotCount = outline?.kind === "outline" ? outline.shotCount : outlineSrc ? Number(outlineSrc.node.data.params.shotCount) || count : count;
    const location = sourceLocation ? imageSetOf(sourceLocation, "location", MISSING_LOCATION, outputOf).description : undefined;
    const text = episodeWriterPrompt({ members: cast.members ?? [], rules: cast.rules ?? "", ...(location ? { location } : {}), story, shotCount }, 1, Math.min(BATCH_SIZE, shotCount));
    return { sections: [{ title: "Prompt gửi Biên kịch (đợt 1)", text }], notes: [`Viết từng đợt ${BATCH_SIZE} cảnh trong cùng chat; các đợt sau nhắc cuối cảnh trước.`] };
  }
  const products = productSpecOf(sourceOf(node.id, "product", nodes, edges), outputOf);
  const text = productWriterPrompt({
    idea: str(p.idea).trim(),
    shotCount: count,
    ...(sourceCharacter ? { character: imageSetOf(sourceCharacter, "character", MISSING_CHARACTER, outputOf).description } : {}),
    ...(sourceLocation ? { location: imageSetOf(sourceLocation, "location", MISSING_LOCATION, outputOf).description } : {}),
  }, products);
  return { sections: [{ title: "Prompt gửi Biên kịch", text }] };
}

// Prompt sẽ gửi Muse của một node: Cảnh (cắt / nối / chữ → video) và Biên kịch; node khác chỉ ghi "Prompt được tạo khi chạy".
export function promptPreview(
  nodeId: string,
  nodes: readonly PreviewNode[],
  edges: readonly PreviewWire[],
  outputOf: (id: string) => NodeOutputs | null | undefined,
): PromptPreview {
  const node = nodes.find((n) => n.id === nodeId);
  if (node?.type === "scene") return scenePreview(node, nodes, edges, outputOf);
  if (node?.type === "writer") return writerPreview(node, nodes, edges, outputOf);
  return { note: PROMPT_AT_RUN };
}
