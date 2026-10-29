import { SHOT_SIZES, SUBJECTS } from "../../shared/director";
import { useEditor, type NodeViewProps } from "../../features/editor/ui/node-kit";
import { ProviderSelect } from "../../features/editor/ui/widgets";
import type { WriterParams } from "./definition";

export function WriterView({ id, params, setParams, state }: NodeViewProps<WriterParams>) {
  const editor = useEditor();
  const shots = state?.output?.shots;
  const props = state?.output?.props;
  const hasResult = shots?.kind === "shotlist";
  return (
    <div className="stack nowheel">
      <label className="field">
        <span>Ý tưởng (ai, ở đâu, làm gì, kết thúc ra sao)</span>
        <textarea className="nodrag" rows={4} data-testid={`writer-idea-${id}`} value={params.idea ?? ""} onChange={(e) => setParams({ idea: e.target.value })} />
      </label>
      <label className="field">
        <span>Số cảnh (mỗi cảnh 5 giây)</span>
        <input
          className="nodrag"
          type="number"
          min={4}
          max={24}
          data-testid={`writer-count-${id}`}
          value={params.shotCount ?? 12}
          onChange={(e) => setParams({ shotCount: Number(e.target.value) })}
        />
      </label>
      <ProviderSelect id={id} value={params.provider} onChange={(provider) => setParams({ provider })} />
      {shots?.kind === "shotlist" ? (
        <div className="writer-result" data-testid={`writer-result-${id}`}>
          {props?.kind === "propspec" && props.items.length > 0 && (
            <p className="hint">Đồ vật: {props.items.map((p) => `${p.name} (${p.states.join(" → ")})`).join("; ")}</p>
          )}
          <ol>
            {shots.shots.map((s) => (
              <li key={s.id}>
                <strong>
                  {SHOT_SIZES[s.size].label} · {SUBJECTS[s.subject].label}
                  {s.link === "chain" ? " · nối" : ""}
                </strong>
                {s.start && <div>Khung đầu: {s.start}</div>}
                <div>Chuyển động: {s.motion}</div>
                {s.props && <div className="hint">{s.props}</div>}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="preview empty small">Chưa có kịch bản</div>
      )}
      <button
        type="button"
        className="nodrag"
        data-testid={`writer-expand-${id}`}
        disabled={!hasResult || editor.busy}
        title={hasResult ? "Thay các thẻ cảnh của Biên kịch này bằng kịch bản mới nhất (bỏ phần sửa tay)" : undefined}
        onClick={() => editor.expandScenes(id)}
      >
        Tạo thẻ cảnh
      </button>
      {!hasResult && <p className="hint">Bấm ▶ Chạy để Biên kịch viết kịch bản trước, rồi mới tạo thẻ cảnh.</p>}
    </div>
  );
}
