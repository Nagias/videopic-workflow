import { useLayoutEffect, useRef } from "react";
import { mediaUrl } from "../../shared/api";
import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import { PhotoDrop } from "../../features/editor/ui/PhotoDrop";
import { AssetPicker, ProviderSelect } from "../../features/editor/ui/widgets";
import { FILM_STYLE_IDS, FILM_STYLE_LABEL, type FilmStyle } from "../../shared/styles";
import { orphanPhotos, photosFor, rowStates, type PropRow, type PropsParams } from "./definition";

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Ảnh thật của một trạng thái thay bằng danh sách mới (khoá cũ viết khác hoa thường cũng thay); danh sách rỗng thì bỏ khoá.
// Không còn ảnh nào thì bỏ hẳn trường photos (tham số y hệt món chưa từng có ảnh).
function withStatePhotos(row: PropRow, state: string, list: string[]): PropRow["photos"] {
  const rest = Object.fromEntries(Object.entries(row.photos ?? {}).filter(([k]) => !sameText(k, state)));
  return nonEmpty(list.length ? { ...rest, [state]: list } : rest);
}

const nonEmpty = (photos: NonNullable<PropRow["photos"]>): PropRow["photos"] => (Object.keys(photos).length ? photos : undefined);

// Bỏ mọi ảnh mồ côi (khoá không còn khớp trạng thái nào).
function withoutOrphans(row: PropRow): PropRow["photos"] {
  const states = rowStates(row);
  return nonEmpty(Object.fromEntries(Object.entries(row.photos ?? {}).filter(([k]) => states.some((s) => sameText(s, k)))));
}

export function PropsView({ id, params, setParams, state, incoming }: NodeViewProps<PropsParams>) {
  const fromWriter = incoming.some((w) => w.port === "spec");
  const items = params.items ?? [];
  const out = state?.output?.props;
  const update = (i: number, patch: Partial<PropRow>) => setParams({ items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const remove = (i: number) => setParams({ items: items.filter((_, j) => j !== i) });
  const add = () => setParams({ items: [...items, { name: "", description: "", states: "" }] });
  // Ô ảnh báo thay đổi sau khi tải xong (vài giây): áp lên tham số MỚI NHẤT, không lên bản lúc thả ảnh — nếu không, ảnh của ô
  // khác vừa tải xong hoặc chữ vừa gõ trong lúc chờ sẽ bị ghi đè mất.
  const latest = useRef(params);
  useLayoutEffect(() => {
    latest.current = params;
  });
  const changePhotos = (i: number, name: string, state: string, change: (list: string[]) => string[]) => {
    const rows = latest.current.items ?? [];
    // Tìm món theo vị trí; vị trí đã đổi (thêm/xoá dòng trong lúc tải) thì theo tên; món đã bị xoá thì thôi.
    const k = rows[i] && sameText(rows[i].name, name) ? i : rows.findIndex((r) => sameText(r.name, name));
    const row = rows[k];
    if (!row) return;
    const next = rows.map((r, j) => (j === k ? { ...r, photos: withStatePhotos(row, state, change(photosFor(row, state))) } : r));
    latest.current = { ...latest.current, items: next };
    setParams({ items: next });
  };
  const addFromLibrary = (picked: Record<string, unknown>) => {
    const more = Array.isArray(picked.items) ? (picked.items as PropRow[]) : [];
    const fresh = more.filter((m) => !items.some((it) => it.name.trim().toLowerCase() === m.name.trim().toLowerCase()));
    setParams({ items: [...items, ...fresh] });
  };

  return (
    <div className="stack nowheel">
      <AssetPicker id={id} kind="props" onPick={addFromLibrary} />
      <p className="hint">Nối cổng "Từ Biên kịch" thì danh sách dưới đây bị bỏ qua. Trạng thái có ảnh thật thì dùng ảnh đó, không tốn lượt; thiếu ảnh thì dịch vụ vẽ dựa trên ảnh thật.</p>
      {items.map((it, i) => (
        <div className="shot-row" key={i}>
          <div className="shot-head">
            <strong>{i + 1}</strong>
            <input className="nodrag" data-testid={`prop-name-${id}-${i + 1}`} placeholder="Tên (vd: khúc gỗ)" value={it.name} onChange={(e) => update(i, { name: e.target.value })} />
            <button type="button" className="icon nodrag" title="Xoá đồ vật" onClick={() => remove(i)}>
              ✕
            </button>
          </div>
          <textarea
            className="nodrag"
            rows={2}
            data-testid={`prop-desc-${id}-${i + 1}`}
            placeholder="Mô tả: chất liệu, màu, kích thước"
            value={it.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <input
            className="nodrag"
            data-testid={`prop-states-${id}-${i + 1}`}
            placeholder="Trạng thái, cách nhau dấu phẩy (vd: nguyên khúc, bổ đôi)"
            value={it.states}
            onChange={(e) => update(i, { states: e.target.value })}
          />
          {rowStates(it).map((state, s) => (
            <div className="photo-state" key={`${s}-${state}`}>
              <span className="photo-state-name">{state}</span>
              <PhotoDrop
                ids={{
                  drop: `prop-photo-drop-${id}-${i + 1}-${s + 1}`,
                  photo: (k) => `prop-photo-${id}-${i + 1}-${s + 1}-${k}`,
                  remove: (k) => `prop-photo-remove-${id}-${i + 1}-${s + 1}-${k}`,
                }}
                label={state}
                photos={photosFor(it, state)}
                onAdd={(added) => changePhotos(i, it.name, state, (list) => [...list, ...added.filter((m) => !list.includes(m))])}
                onRemove={(m) => changePhotos(i, it.name, state, (list) => list.filter((x) => x !== m))}
              />
            </div>
          ))}
          {orphanPhotos(it).length > 0 && (
            <div className="photo-orphans" data-testid={`prop-photo-orphan-${id}-${i + 1}`}>
              <span className="node-warn">
                {orphanPhotos(it).length} ảnh chưa gắn trạng thái (tên trạng thái đã đổi). Vẫn dùng làm mẫu khi vẽ trạng thái thiếu ảnh.
              </span>
              <button type="button" className="nodrag" data-testid={`prop-photo-orphan-remove-${id}-${i + 1}`} onClick={() => update(i, { photos: withoutOrphans(it) })}>
                Bỏ ảnh chưa gắn
              </button>
            </div>
          )}
        </div>
      ))}
      <button type="button" className="nodrag" data-testid={`add-prop-${id}`} onClick={add}>
        + Thêm đồ vật
      </button>
      {fromWriter ? (
        <p className="hint">Phong cách vẽ theo Biên kịch đang nối vào.</p>
      ) : (
        <label className="field">
          <span>Phong cách phim</span>
          <select
            className="nodrag"
            data-testid={`props-style-${id}`}
            value={params.style ?? "thuc"}
            onChange={(e) => setParams({ style: e.target.value === "thuc" ? undefined : (e.target.value as FilmStyle) })}
          >
            {FILM_STYLE_IDS.map((s) => (
              <option key={s} value={s}>
                {FILM_STYLE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      )}
      <ProviderSelect id={id} value={params.provider} onChange={(provider) => setParams({ provider })} />
      {out?.kind === "props" && out.items.some((x) => x.images.length > 0) ? (
        <div className="gallery" data-testid={`props-gallery-${id}`}>
          {out.items.flatMap((item) =>
            item.images.map((img) => (
              <figure key={img.mediaId}>
                <a href={mediaUrl(img.mediaId)} target="_blank" rel="noreferrer">
                  <img src={mediaUrl(img.mediaId)} alt={`${item.name} — ${img.state}`} loading="lazy" />
                </a>
                <figcaption>
                  {item.name} · {img.state}
                </figcaption>
              </figure>
            )),
          )}
        </div>
      ) : (
        <div className="preview empty small">Chưa có ảnh đồ vật</div>
      )}
    </div>
  );
}
