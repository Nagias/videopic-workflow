import type { Ffmpeg } from "../core/ffmpeg";
import type { Storage } from "../core/storage";
import type { ClipDuration, ProviderId } from "../shared/providers";

export type VideoRequest = { prompt: string; durationSec: ClipDuration };

export type ProviderContext = {
  signal: AbortSignal;
  report(message: string): void;
  storage: Storage;
  ffmpeg: Ffmpeg;
};

export type GeneratedVideo = { mediaId: string; durationSec: number; width: number; height: number };

export interface VideoProvider {
  id: ProviderId;
  generateVideo(req: VideoRequest, ctx: ProviderContext): Promise<GeneratedVideo>;
}

export type ProviderRegistry = { get(id: ProviderId): VideoProvider };

export class ProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
