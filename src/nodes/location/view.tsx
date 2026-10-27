import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import { ImageSetGallery, ProviderSelect } from "../../features/editor/ui/widgets";
import type { LocationParams } from "./definition";

export function LocationView({ id, params, setParams, state }: NodeViewProps<LocationParams>) {
  const set = state?.output?.location;
  return (
    <div className="stack">
      <label className="field">
        <span>Mô tả bối cảnh (địa hình, vật cố định, ánh sáng)</span>
        <textarea
          className="nodrag nowheel"
          rows={5}
          data-testid={`location-text-${id}`}
          value={params.description ?? ""}
          onChange={(e) => setParams({ description: e.target.value })}
        />
      </label>
      <ProviderSelect id={id} value={params.provider} onChange={(provider) => setParams({ provider })} />
      <ImageSetGallery id={id} set={set?.kind === "imageset" ? set : undefined} />
    </div>
  );
}
