export const PROVIDERS = [
  { id: "fake", label: "Thử (giả, không tốn lượt)" },
  { id: "muse", label: "Muse (thật)" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];
export const PROVIDER_IDS = PROVIDERS.map((p) => p.id) as [ProviderId, ...ProviderId[]];

export const CLIP_DURATIONS = [5, 10] as const;
export type ClipDuration = (typeof CLIP_DURATIONS)[number];
