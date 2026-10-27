import { mediaUrl } from "../../shared/api";
import { CLIP_DURATIONS, PROVIDERS, type ClipDuration, type ProviderId } from "../../shared/providers";
import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import type { GenerateVideoParams } from "./definition";

export function GenerateVideoView({ id, params, setParams, state }: NodeViewProps<GenerateVideoParams>) {
  const video = state?.output?.video;
  return (
    <div className="stack">
      <label className="field">
        <span>Dịch vụ</span>
        <select
          className="nodrag"
          data-testid={`provider-select-${id}`}
          value={params.provider}
          onChange={(e) => setParams({ provider: e.target.value as ProviderId })}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Thời lượng</span>
        <select
          className="nodrag"
          data-testid={`duration-select-${id}`}
          value={params.durationSec}
          onChange={(e) => setParams({ durationSec: Number(e.target.value) as ClipDuration })}
        >
          {CLIP_DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d} giây
            </option>
          ))}
        </select>
      </label>
      {video?.kind === "video" ? (
        <video
          className="preview nodrag"
          data-testid={`video-preview-${id}`}
          src={mediaUrl(video.mediaId)}
          controls
          preload="metadata"
        />
      ) : (
        <div className="preview empty">Chưa có clip</div>
      )}
    </div>
  );
}
