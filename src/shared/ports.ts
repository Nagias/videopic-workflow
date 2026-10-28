import { z } from "zod";
import { ShotSchema } from "./director";

export const PORT_KINDS = ["text", "video", "imageset", "shotlist", "storyboard"] as const;
export type PortKind = (typeof PORT_KINDS)[number];

export const PORT_KIND_LABEL: Record<PortKind, string> = {
  text: "Chữ",
  video: "Video",
  imageset: "Bộ ảnh",
  shotlist: "Danh sách cảnh",
  storyboard: "Storyboard",
};

export type PortDef = { name: string; kind: PortKind; label: string };

export const ImageRefSchema = z.object({ mediaId: z.string().min(1), view: z.string() });

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
  z.object({
    kind: z.literal("video"),
    mediaId: z.string().min(1),
    durationSec: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  z.object({
    kind: z.literal("imageset"),
    role: z.enum(["character", "location"]),
    description: z.string(),
    images: z.array(ImageRefSchema),
    session: z.object({ accountId: z.string(), threadUrl: z.string() }).optional(),
  }),
  z.object({ kind: z.literal("shotlist"), shots: z.array(ShotSchema) }),
  z.object({ kind: z.literal("storyboard"), shots: z.array(StoryboardShotSchema) }),
]);
export type PortValue = z.infer<typeof PortValueSchema>;
export type TextValue = Extract<PortValue, { kind: "text" }>;
export type VideoValue = Extract<PortValue, { kind: "video" }>;
export type ImageSetValue = Extract<PortValue, { kind: "imageset" }>;
export type ShotListValue = Extract<PortValue, { kind: "shotlist" }>;
export type StoryboardValue = Extract<PortValue, { kind: "storyboard" }>;

export const NodeOutputsSchema = z.record(z.string(), PortValueSchema);
export type NodeOutputs = z.infer<typeof NodeOutputsSchema>;
