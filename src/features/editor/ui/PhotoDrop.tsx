import { useRef, useState, type DragEvent } from "react";
import { api } from "../../../app/api-client";
import { mediaUrl } from "../../../shared/api";

// Mã data-testid của một ô ảnh: vùng thả, ảnh thứ k (từ 1), nút xoá ảnh thứ k. Lỗi là `${drop}-error`, ô chọn file `${drop}-input`.
export type PhotoDropIds = { drop: string; photo: (k: number) => string; remove: (k: number) => string };

// Ô ảnh thật: kéo thả hoặc bấm chọn file (nhiều ảnh), tải lần lượt qua api.uploadImage(), hiện ảnh nhỏ kèm nút xoá.
// Ảnh nào tải lỗi thì báo tiếng Việt ngay dưới ô; ảnh đã tải xong trước đó vẫn được giữ.
export function PhotoDrop({ ids, label, photos, max, onChange }: { ids: PhotoDropIds; label: string; photos: string[]; max?: number; onChange: (photos: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const room = max === undefined ? Infinity : max - photos.length;

  const add = async (picked: File[]) => {
    if (picked.length === 0) return;
    setError(null);
    const files = picked.slice(0, Math.max(0, room));
    if (files.length < picked.length) setError(`Tối đa ${max} ảnh`);
    setBusy(true);
    const added: string[] = [];
    try {
      for (const f of files) {
        try {
          const r = await api.uploadImage(f);
          if (!photos.includes(r.mediaId) && !added.includes(r.mediaId)) added.push(r.mediaId);
        } catch (err) {
          setError(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
          break;
        }
      }
    } finally {
      setBusy(false);
      if (added.length) onChange([...photos, ...added]);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void add([...e.dataTransfer.files]);
  };

  return (
    <div className="photo-drop-wrap">
      {photos.length > 0 && (
        <div className="photo-thumbs">
          {photos.map((m, i) => (
            <figure key={m} data-testid={ids.photo(i + 1)}>
              <a href={mediaUrl(m)} target="_blank" rel="noreferrer">
                <img src={mediaUrl(m)} alt={`${label}: ảnh ${i + 1}`} loading="lazy" />
              </a>
              <button type="button" className="icon nodrag" title="Bỏ ảnh này" data-testid={ids.remove(i + 1)} onClick={() => onChange(photos.filter((x) => x !== m))}>
                ✕
              </button>
            </figure>
          ))}
        </div>
      )}
      {room > 0 && (
        <div
          className={`photo-drop nodrag${over ? " over" : ""}`}
          data-testid={ids.drop}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") input.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          {busy ? "Đang tải ảnh…" : `+ Ảnh thật: ${label} (kéo thả hoặc bấm chọn)`}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            data-testid={`${ids.drop}-input`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              void add(files);
            }}
          />
        </div>
      )}
      {error && (
        <em className="node-error inline" data-testid={`${ids.drop}-error`}>
          {error}
        </em>
      )}
    </div>
  );
}
