import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import { AssetPicker, ImageSetGallery, ProviderSelect } from "../../features/editor/ui/widgets";
import type { CharacterParams } from "./definition";

export function CharacterView({ id, params, setParams, state }: NodeViewProps<CharacterParams>) {
  const set = state?.output?.character;
  return (
    <div className="stack">
      <AssetPicker id={id} kind="character" onPick={(p) => setParams(p)} />
      <label className="field">
        <span>Tên</span>
        <input className="nodrag" data-testid={`asset-name-${id}`} value={params.name ?? ""} placeholder="vd: Cô gái Sơn La" onChange={(e) => setParams({ name: e.target.value })} />
      </label>
      <label className="field">
        <span>Mô tả nhân vật (gương mặt, tóc, vóc dáng, trang phục)</span>
        <textarea
          className="nodrag nowheel"
          rows={6}
          data-testid={`character-text-${id}`}
          value={params.description ?? ""}
          onChange={(e) => setParams({ description: e.target.value })}
        />
      </label>
      <ProviderSelect id={id} value={params.provider} onChange={(provider) => setParams({ provider })} />
      <ImageSetGallery id={id} set={set?.kind === "imageset" ? set : undefined} />
    </div>
  );
}
