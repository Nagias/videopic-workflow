import type { NodeViewProps } from "../../features/editor/ui/node-kit";
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
