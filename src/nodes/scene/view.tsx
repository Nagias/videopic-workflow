import { mediaUrl } from "../../shared/api";
import { CAMERA_ANGLES, CAMERA_MOVES, SHOT_SIZES, SUBJECTS } from "../../shared/director";
import { PROVIDERS, type ProviderId } from "../../shared/providers";
import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import type { SceneParams } from "./definition";

const options = (o: Record<string, { label: string }>) =>
  Object.entries(o).map(([k, v]) => (
    <option key={k} value={k}>
      {v.label}
    </option>
  ));

// Form gọn cho một cảnh (đợt 1B thay bằng thẻ cảnh).
export function SceneView({ id, params, setParams, state }: NodeViewProps<SceneParams>) {
  const frame = state?.output?.frame;
  const clip = state?.output?.clip;
  return (
    <div className="stack nowheel">
      <div className="shot-head">
        <select className="nodrag" data-testid={`scene-size-${id}`} value={params.size} onChange={(e) => setParams({ size: e.target.value as SceneParams["size"] })}>
          {options(SHOT_SIZES)}
        </select>
        <select className="nodrag" data-testid={`scene-angle-${id}`} value={params.angle} onChange={(e) => setParams({ angle: e.target.value as SceneParams["angle"] })}>
          {options(CAMERA_ANGLES)}
        </select>
        <select className="nodrag" data-testid={`scene-move-${id}`} value={params.move} onChange={(e) => setParams({ move: e.target.value as SceneParams["move"] })}>
          {options(CAMERA_MOVES)}
        </select>
        <select className="nodrag" data-testid={`scene-subject-${id}`} value={params.subject} onChange={(e) => setParams({ subject: e.target.value as SceneParams["subject"] })}>
          {options(SUBJECTS)}
        </select>
      </div>
      <textarea
        className="nodrag"
        rows={2}
        value={params.start ?? ""}
        data-testid={`scene-start-${id}`}
        placeholder="Khung đầu: ảnh đứng yên lúc cảnh bắt đầu (bỏ trống nếu nối tiếp cảnh trước)"
        onChange={(e) => setParams({ start: e.target.value })}
      />
      <textarea
        className="nodrag"
        rows={2}
        value={params.motion ?? ""}
        data-testid={`scene-motion-${id}`}
        placeholder="Chuyển động 5 giây: chỉ việc xảy ra SAU khung đầu, có lực và hệ quả"
        onChange={(e) => setParams({ motion: e.target.value })}
      />
      <textarea
        className="nodrag"
        rows={2}
        value={params.props ?? ""}
        data-testid={`scene-props-${id}`}
        placeholder={"Đồ vật trong khung, mỗi dòng một món:\nkhúc gỗ: nguyên khúc -> bổ đôi"}
        onChange={(e) => setParams({ props: e.target.value })}
      />
      <label className="field">
        <span>Dịch vụ</span>
        <select className="nodrag" data-testid={`scene-provider-${id}`} value={params.provider} onChange={(e) => setParams({ provider: e.target.value as ProviderId })}>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {frame?.kind === "image" ? (
        <img className="preview nodrag" data-testid={`scene-frame-${id}`} src={mediaUrl(frame.mediaId)} alt="Khung đầu" loading="lazy" />
      ) : (
        <div className="preview empty small">Chưa có khung đầu</div>
      )}
      {clip?.kind === "video" ? (
        <video className="preview nodrag" data-testid={`scene-clip-${id}`} src={mediaUrl(clip.mediaId)} controls preload="metadata" />
      ) : (
        <div className="preview empty">Chưa có clip</div>
      )}
    </div>
  );
}
