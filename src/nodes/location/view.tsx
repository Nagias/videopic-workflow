import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import { PhotoDrop } from "../../features/editor/ui/PhotoDrop";
import { AssetPicker, ImageSetGallery, ProviderSelect } from "../../features/editor/ui/widgets";
import { DEFAULT_LOOK } from "../../shared/prompts";
import type { LocationParams } from "./definition";

export function LocationView({ id, params, setParams, replaceParams, state }: NodeViewProps<LocationParams>) {
  const set = state?.output?.location;
  return (
    <div className="stack">
      <AssetPicker id={id} kind="location" onPick={replaceParams} />
      <label className="field">
        <span>Tên</span>
        <input className="nodrag" data-testid={`asset-name-${id}`} value={params.name ?? ""} placeholder="vd: Sườn đồi Sơn La" onChange={(e) => setParams({ name: e.target.value })} />
      </label>
      <div className="field">
        <span>Ảnh thật bối cảnh (tối đa 2: toàn cảnh, cận). Có ảnh thì không gọi dịch vụ; vẫn cần mô tả để Biên kịch và từng cảnh đọc</span>
        <PhotoDrop
          ids={{ drop: `location-photo-drop-${id}`, photo: (k) => `location-photo-${id}-${k}`, remove: (k) => `location-photo-remove-${id}-${k}` }}
          label="bối cảnh"
          photos={params.photos ?? []}
          max={2}
          onChange={(photos) => setParams({ photos })}
        />
      </div>
      <label className="field">
        <span>Mô tả bối cảnh (địa hình, cây cối, ánh sáng — đồ vật như lều, bếp đá để ở node Đồ vật)</span>
        <textarea
          className="nodrag nowheel"
          rows={5}
          data-testid={`location-text-${id}`}
          value={params.description ?? ""}
          onChange={(e) => setParams({ description: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Tông ảnh dùng chung cho mọi cảnh</span>
        <textarea
          className="nodrag nowheel"
          rows={2}
          data-testid={`location-look-${id}`}
          value={params.look ?? ""}
          placeholder={DEFAULT_LOOK}
          onChange={(e) => setParams({ look: e.target.value })}
        />
      </label>
      <ProviderSelect id={id} value={params.provider} onChange={(provider) => setParams({ provider })} />
      <ImageSetGallery id={id} set={set?.kind === "imageset" ? set : undefined} />
    </div>
  );
}
