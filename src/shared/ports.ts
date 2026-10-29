import { z } from "zod";
import { ShotSchema } from "./director";

export const PORT_KINDS = ["text", "image", "video", "imageset", "shotlist", "storyboard", "props", "propspec"] as const;
export type PortKind = (typeof PORT_KINDS)[number];

export const PORT_KIND_LABEL: Record<PortKind, string> = {
  text: "Chữ",
  image: "Ảnh",
  video: "Video",
  imageset: "Bộ ảnh",
  shotlist: "Danh sách cảnh",
  storyboard: "Storyboard",
  props: "Đồ vật",
  propspec: "Danh sách đồ vật",
};

// optional: node vẫn chạy khi cổng vào này chưa nối (planGraph bỏ qua).
// multiple: cổng vào nhận nhiều dây; node nhận mảng giá trị theo thứ tự params.order rồi toạ độ.
export type PortDef = { name: string; kind: PortKind; label: string; optional?: boolean; multiple?: boolean };

export const ImageRefSchema = z.object({ mediaId: z.string().min(1), view: z.string() });

export const PropSpecItemSchema = z.object({
  name: z.string().trim().min(1, "Đồ vật chưa có tên"),
  description: z.string().trim().min(5, "Mô tả đồ vật quá ngắn"),
  states: z.array(z.string().trim().min(1)).min(1, "Đồ vật cần ít nhất một trạng thái"),
});
export type PropSpecItem = z.infer<typeof PropSpecItemSchema>;

// Luật chung cho danh sách đồ vật (node Đồ vật và Biên kịch dùng cùng một luật).
export function propSpecProblems(items: PropSpecItem[]): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    if (seen.has(key)) problems.push(`Đồ vật trùng tên "${item.name.trim()}"`);
    seen.add(key);
  }
  return problems;
}

export const PropItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  images: z.array(z.object({ mediaId: z.string().min(1), state: z.string() })),
});
export type PropItem = z.infer<typeof PropItemSchema>;

export const StoryboardShotSchema = z.object({
  shotId: z.string(),
  status: z.enum(["pending", "running", "done", "failed", "skipped"]),
  keyframeId: z.string().optional(),
  clipId: z.string().optional(),
  error: z.string().optional(),
  note: z.string().optional(),
});
export type StoryboardShot = z.infer<typeof StoryboardShotSchema>;

export const PortValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("image"), mediaId: z.string().min(1), width: z.number(), height: z.number() }),
  z.object({
    kind: z.literal("video"),
    mediaId: z.string().min(1),
    durationSec: z.number(),
    width: z.number(),
    height: z.number(),
    // Thông tin để ghép clip: cắt đầu bao nhiêu giây, có tiếng không, độ sáng đầu/cuối.
    // durationSec ở trên luôn là thời lượng thật của file; phần dùng khi ghép = min(durationSec, SHOT_SECONDS) − clip.trimStartSec.
    clip: z
      .object({
        trimStartSec: z.number(),
        hasAudio: z.boolean(),
        brightness: z.object({ startLuma: z.number(), endLuma: z.number(), clipSec: z.number() }).optional(),
      })
      .optional(),
  }),
  z.object({
    kind: z.literal("imageset"),
    role: z.enum(["character", "location"]),
    description: z.string(),
    images: z.array(ImageRefSchema),
    session: z.object({ accountId: z.string(), threadUrl: z.string() }).optional(),
    look: z.string().optional(),
  }),
  z.object({ kind: z.literal("shotlist"), shots: z.array(ShotSchema) }),
  z.object({ kind: z.literal("storyboard"), shots: z.array(StoryboardShotSchema) }),
  z.object({ kind: z.literal("props"), items: z.array(PropItemSchema) }),
  z.object({ kind: z.literal("propspec"), items: z.array(PropSpecItemSchema) }),
]);
export type PortValue = z.infer<typeof PortValueSchema>;
export type TextValue = Extract<PortValue, { kind: "text" }>;
export type ImageValue = Extract<PortValue, { kind: "image" }>;
export type VideoValue = Extract<PortValue, { kind: "video" }>;
export type ImageSetValue = Extract<PortValue, { kind: "imageset" }>;
export type ShotListValue = Extract<PortValue, { kind: "shotlist" }>;
export type StoryboardValue = Extract<PortValue, { kind: "storyboard" }>;
export type PropSetValue = Extract<PortValue, { kind: "props" }>;
export type PropSpecValue = Extract<PortValue, { kind: "propspec" }>;

export const NodeOutputsSchema = z.record(z.string(), PortValueSchema);
export type NodeOutputs = z.infer<typeof NodeOutputsSchema>;

// Mã media trong một giá trị bước con đã lưu ({ mediaId, … }); không có thì undefined.
export const mediaIdOf = (v: unknown): string | undefined => {
  const id = v && typeof v === "object" ? (v as { mediaId?: unknown }).mediaId : undefined;
  return typeof id === "string" ? id : undefined;
};

// Giá trị đầu vào của node: cổng thường một PortValue, cổng `multiple` mảng PortValue theo thứ tự đã sắp.
export type NodeInputs = Record<string, PortValue | PortValue[]>;

// Cổng thường không bắt buộc: chưa nối (hoặc nối giá trị khác kiểu) thì trả undefined.
export function pickInput<K extends PortValue["kind"]>(inputs: Readonly<NodeInputs>, name: string, kind: K): Extract<PortValue, { kind: K }> | undefined {
  const v = inputs[name];
  return v && !Array.isArray(v) && v.kind === kind ? (v as Extract<PortValue, { kind: K }>) : undefined;
}
