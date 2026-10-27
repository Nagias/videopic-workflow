import type { Ffmpeg } from "../core/ffmpeg";
import type { Storage } from "../core/storage";
import type { ClipDuration, ProviderId } from "../shared/providers";

export type ImageReference = { mediaId: string; role: string };

export type ImageRequest = { prompt: string; references: ImageReference[] };

export type VideoRequest = { prompt: string; durationSec: ClipDuration; firstFrameMediaId?: string };

export type ProviderContext = {
  signal: AbortSignal;
  report(message: string): void;
  storage: Storage;
  ffmpeg: Ffmpeg;
};

export type GeneratedVideo = { mediaId: string; durationSec: number; width: number; height: number };
export type GeneratedImage = { mediaId: string; width: number; height: number };

export interface MediaProvider {
  id: ProviderId;
  generateVideo(req: VideoRequest, ctx: ProviderContext): Promise<GeneratedVideo>;
  generateImage(req: ImageRequest, ctx: ProviderContext): Promise<GeneratedImage>;
  maxParallel(): number;
}

export type ProviderRegistry = { get(id: ProviderId): MediaProvider };

export class ProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ProviderError";
  }
}
