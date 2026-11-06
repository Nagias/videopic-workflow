import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import { ProviderSelect } from "../../features/editor/ui/widgets";
import { MAX_EPISODE_SHOTS, type OutlineParams } from "./definition";

export function OutlineView({ id, params, setParams, state }: NodeViewProps<OutlineParams>) {
  const outline = state?.output?.outline;
  const made = outline?.kind === "outline" ? outline : undefined;
  return (
    <div className="stack nowheel">
      <label className="field">
        <span>Số cảnh (mỗi cảnh 5 giây; 36 cảnh = 3 phút)</span>
        <input
          className="nodrag"
          type="number"
          min={12}
          max={MAX_EPISODE_SHOTS}
          data-testid={`outline-count-${id}`}
          value={params.shotCount ?? MAX_EPISODE_SHOTS}
          onChange={(e) => setParams({ shotCount: Number(e.target.value) })}
        />
      </label>
      {made ? (
        <pre className="resulttext" data-testid={`outline-result-${id}`}>
          {made.text}
        </pre>
      ) : (
        <div className="preview empty small">Bấm ▶ Chạy để đạo diễn AI viết dàn ý</div>
      )}
      <label className="field">
        <span>Sửa dàn ý (có chữ ở đây thì Biên kịch dùng bản này, không hỏi Muse)</span>
        <textarea className="nodrag" rows={6} data-testid={`outline-own-${id}`} value={params.own ?? ""} onChange={(e) => setParams({ own: e.target.value })} />
      </label>
      <button
        type="button"
        className="nodrag"
        data-testid={`outline-copy-${id}`}
        disabled={!made || made.text === params.own}
        onClick={() => made && setParams({ own: made.text })}
      >
        Chép dàn ý Muse viết vào ô sửa
      </button>
      <ProviderSelect id={id} value={params.provider} onChange={(provider) => setParams({ provider })} />
    </div>
  );
}
