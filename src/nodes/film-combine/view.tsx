import { mediaUrl } from "../../shared/api";
import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import type { FilmCombineParams } from "./definition";

export function FilmCombineView({ id, params, setParams, state }: NodeViewProps<FilmCombineParams>) {
  const video = state?.output?.video;
  return (
    <div className="stack">
      <label className="check nodrag">
        <input
          type="checkbox"
          data-testid={`film-combine-brightness-${id}`}
          checked={params.fixBrightness ?? true}
          onChange={(e) => setParams({ fixBrightness: e.target.checked })}
        />
        Bù độ sáng giữa các cảnh (Muse làm cuối clip tối dần)
      </label>
      {video?.kind === "video" ? (
        <video className="preview nodrag" data-testid={`film-combine-video-${id}`} src={mediaUrl(video.mediaId)} controls preload="metadata" />
      ) : (
        <div className="preview empty">Chưa có phim</div>
      )}
    </div>
  );
}
