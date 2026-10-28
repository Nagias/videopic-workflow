import { mediaUrl } from "../../shared/api";
import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import { ProviderSelect, StoryboardStrip } from "../../features/editor/ui/widgets";
import type { FilmParams } from "./definition";

export function FilmView({ id, params, setParams, state }: NodeViewProps<FilmParams>) {
  const board = state?.output?.storyboard;
  const video = state?.output?.video;
  return (
    <div className="stack">
      <ProviderSelect id={id} value={params.provider} onChange={(provider) => setParams({ provider })} />
      <label className="check nodrag">
        <input type="checkbox" checked={params.fixBrightness ?? true} onChange={(e) => setParams({ fixBrightness: e.target.checked })} />
        Bù độ sáng (Muse làm cuối clip tối dần)
      </label>
      <StoryboardStrip id={id} shots={board?.kind === "storyboard" ? board.shots : []} />
      {video?.kind === "video" ? (
        <video className="preview nodrag" data-testid={`video-preview-${id}`} src={mediaUrl(video.mediaId)} controls preload="metadata" />
      ) : (
        <div className="preview empty">Chưa có phim</div>
      )}
    </div>
  );
}
