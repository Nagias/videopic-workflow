import { mediaUrl } from "../../shared/api";
import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import { ProviderSelect } from "../../features/editor/ui/widgets";
import type { PropRow, PropsParams } from "./definition";

export function PropsView({ id, params, setParams, state }: NodeViewProps<PropsParams>) {
  const items = params.items ?? [];
  const out = state?.output?.props;
  const update = (i: number, patch: Partial<PropRow>) => setParams({ items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const remove = (i: number) => setParams({ items: items.filter((_, j) => j !== i) });
  const add = () => setParams({ items: [...items, { name: "", description: "", states: "" }] });

  return (
    <div className="stack nowheel">
      <p className="hint">Nối cổng "Từ Biên kịch" thì danh sách dưới đây bị bỏ qua.</p>
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
        </div>
      ))}
      <button type="button" className="nodrag" data-testid={`add-prop-${id}`} onClick={add}>
        + Thêm đồ vật
      </button>
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
