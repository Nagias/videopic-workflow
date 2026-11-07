import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import { ImageSetGallery, ProviderSelect } from "../../features/editor/ui/widgets";
import { MAX_CAST, type CastMember } from "../../shared/cast";
import { CARTOON_STYLE_IDS, FILM_STYLE_LABEL, type CartoonStyle } from "../../shared/styles";
import type { CastParams } from "./definition";

const EMPTY: CastMember = { name: "", look: "", size: "", trait: "" };

export function CastView({ id, params, setParams, state }: NodeViewProps<CastParams>) {
  const set = state?.output?.character;
  const members = Array.isArray(params.members) ? params.members : [];
  const update = (i: number, patch: Partial<CastMember>) => setParams({ members: members.map((m, k) => (k === i ? { ...m, ...patch } : m)) });
  return (
    <div className="stack nowheel">
      <label className="field">
        <span>Tên loạt phim</span>
        <input
          className="nodrag"
          data-testid={`cast-name-${id}`}
          value={params.name ?? ""}
          placeholder="vd: Mướp và lũ gián"
          onChange={(e) => setParams({ name: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Phong cách vẽ</span>
        <select className="nodrag" data-testid={`cast-style-${id}`} value={params.style} onChange={(e) => setParams({ style: e.target.value as CartoonStyle })}>
          {CARTOON_STYLE_IDS.map((s) => (
            <option key={s} value={s}>
              {FILM_STYLE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      {members.map((m, i) => (
        <fieldset className="stack" key={i} data-testid={`cast-member-${id}-${i}`}>
          <legend>Nhân vật {i + 1}</legend>
          <input
            className="nodrag"
            data-testid={`cast-member-name-${id}-${i}`}
            value={m.name}
            placeholder="Tên gọi (vd: Mướp)"
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <textarea
            className="nodrag"
            rows={3}
            data-testid={`cast-member-look-${id}-${i}`}
            value={m.look}
            placeholder="Ngoại hình: loài, hình dáng, màu, phụ kiện"
            onChange={(e) => update(i, { look: e.target.value })}
          />
          <input
            className="nodrag"
            data-testid={`cast-member-size-${id}-${i}`}
            value={m.size}
            placeholder="Kích thước thật (vd: cao 40 cm; gián: cao 7 cm, chỉ tới đầu gối Mướp)"
            onChange={(e) => update(i, { size: e.target.value })}
          />
          <input
            className="nodrag"
            data-testid={`cast-member-trait-${id}-${i}`}
            value={m.trait}
            placeholder="Tính cách (vd: lười, tham ăn, nóng tính)"
            onChange={(e) => update(i, { trait: e.target.value })}
          />
          <button
            type="button"
            className="nodrag"
            data-testid={`cast-remove-${id}-${i}`}
            onClick={() => setParams({ members: members.filter((_, k) => k !== i) })}
          >
            Bỏ nhân vật này
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="nodrag"
        data-testid={`cast-add-${id}`}
        disabled={members.length >= MAX_CAST}
        onClick={() => setParams({ members: [...members, EMPTY] })}
      >
        + Thêm nhân vật
      </button>
      <label className="field">
        <span>Luật loạt phim (ai đối đầu ai, ai hay thua, điều gì không bao giờ xảy ra)</span>
        <textarea
          className="nodrag"
          rows={4}
          data-testid={`cast-rules-${id}`}
          value={params.rules ?? ""}
          onChange={(e) => setParams({ rules: e.target.value })}
        />
      </label>
      <ProviderSelect id={id} value={params.provider} onChange={(provider) => setParams({ provider })} />
      <ImageSetGallery id={id} set={set?.kind === "imageset" ? set : undefined} />
    </div>
  );
}
