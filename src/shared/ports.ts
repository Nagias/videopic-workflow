import { z } from "zod";

export const PORT_KINDS = ["text", "video"] as const;
export type PortKind = (typeof PORT_KINDS)[number];

export const PORT_KIND_LABEL: Record<PortKind, string> = { text: "Chữ", video: "Video" };

export type PortDef = { name: string; kind: PortKind; label: string };

export const PortValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({
    kind: z.literal("video"),
    mediaId: z.string().min(1),
    durationSec: z.number(),
    width: z.number(),
    height: z.number(),
  }),
]);
export type PortValue = z.infer<typeof PortValueSchema>;
export type TextValue = Extract<PortValue, { kind: "text" }>;
export type VideoValue = Extract<PortValue, { kind: "video" }>;

export const NodeOutputsSchema = z.record(z.string(), PortValueSchema);
export type NodeOutputs = z.infer<typeof NodeOutputsSchema>;
