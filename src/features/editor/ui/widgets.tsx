import { useEffect, useState } from "react";
import { api } from "../../../app/api-client";
import { mediaUrl, type AssetSummary } from "../../../shared/api";
import type { AssetKind } from "../../../shared/node-definition";
import { useEditor } from "./node-kit";
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
  face: "Mặt cận",
  front: "Chính diện",
  side: "Nghiêng",
  back: "Sau lưng",
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

// Chọn lại ảnh mẫu đã tạo ở workflow trước: điền lại đúng tham số → máy chủ dùng lại kết quả, không tốn lượt.
export function AssetPicker({ id, kind, onPick }: { id: string; kind: AssetKind; onPick: (params: Record<string, unknown>) => void }) {
  const [list, setList] = useState<AssetSummary[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const load = () => {
    api.listAssets(kind).then(
      (r) => {
        setList(r.assets);
        setProblem(null);
      },
      (e: unknown) => setProblem(e instanceof Error ? e.message : String(e)),
    );
  };
  const { refreshKey } = useEditor();
  useEffect(load, [kind, refreshKey]);
  return (
    <label className="field">
      <span>Dùng lại từ kho</span>
      <select
        className="nodrag"
        data-testid={`asset-pick-${id}`}
        value=""
        onFocus={load}
        onChange={(e) => {
          const a = list.find((x) => x.id === e.target.value);
          if (a) onPick(a.params);
        }}
      >
        <option value="">{list.length ? `— ${list.length} mục đã tạo —` : "— kho chưa có mục nào —"}</option>
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {problem && <em className="node-error inline">Không tải được kho: {problem}</em>}
    </label>
  );
}
