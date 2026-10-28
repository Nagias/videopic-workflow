import { mediaUrl } from "../../../shared/api";
import type { ImageSetValue, StoryboardShot } from "../../../shared/ports";
import { PROVIDERS, type ProviderId } from "../../../shared/providers";

export function ProviderSelect({ id, value, onChange }: { id: string; value: ProviderId; onChange: (v: ProviderId) => void }) {
  return (
    <label className="field">
      <span>Dịch vụ</span>
      <select className="nodrag" data-testid={`provider-select-${id}`} value={value} onChange={(e) => onChange(e.target.value as ProviderId)}>
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const VIEW_LABEL: Record<string, string> = {
  front: "Chính diện",
  "three-quarter": "Nghiêng 3/4",
  "full-body": "Toàn thân",
  wide: "Toàn cảnh",
  close: "Cận",
};

export function ImageSetGallery({ id, set }: { id: string; set: ImageSetValue | undefined }) {
  if (!set || set.images.length === 0) return <div className="preview empty small">Chưa có ảnh hồ sơ</div>;
  return (
    <div className="gallery" data-testid={`gallery-${id}`}>
      {set.images.map((img) => (
        <figure key={img.mediaId}>
          <a href={mediaUrl(img.mediaId)} target="_blank" rel="noreferrer">
            <img src={mediaUrl(img.mediaId)} alt={VIEW_LABEL[img.view] ?? img.view} loading="lazy" />
          </a>
          <figcaption>{VIEW_LABEL[img.view] ?? img.view}</figcaption>
        </figure>
      ))}
    </div>
  );
}

const SHOT_STATUS: Record<StoryboardShot["status"], string> = {
  pending: "chờ",
  running: "đang làm",
  done: "xong",
  failed: "lỗi",
  skipped: "bỏ qua",
};

export function StoryboardStrip({ id, shots }: { id: string; shots: StoryboardShot[] }) {
  if (shots.length === 0) return null;
  return (
    <div className="storyboard" data-testid={`storyboard-${id}`}>
      {shots.map((s, i) => (
        <div key={s.shotId} className={`sb-shot sb-${s.status}`} title={s.error ?? s.note ?? ""} data-testid={`shot-${id}-${i + 1}`}>
          {s.keyframeId ? <img src={mediaUrl(s.keyframeId)} alt={`Cảnh ${i + 1}`} loading="lazy" /> : <div className="sb-blank" />}
          <span>
            {i + 1} · {SHOT_STATUS[s.status]}
          </span>
        </div>
      ))}
    </div>
  );
}
