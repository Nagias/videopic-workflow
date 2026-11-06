import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import { ProviderSelect } from "../../features/editor/ui/widgets";
import type { IdeasParams } from "./definition";

export function IdeasView({ id, params, setParams, state }: NodeViewProps<IdeasParams>) {
  const options = state?.output?.options;
  const lines = options?.kind === "text" && !params.own?.trim() ? options.text.split("\n").filter((l) => /^\d\.\s/.test(l)) : [];
  return (
    <div className="stack nowheel">
      <label className="field">
        <span>Gợi ý cho tập này (không bắt buộc: chủ đề, đồ vật, dịp lễ…)</span>
        <textarea
          className="nodrag"
          rows={2}
          data-testid={`ideas-hint-${id}`}
          value={params.hint ?? ""}
          onChange={(e) => setParams({ hint: e.target.value })}
        />
      </label>
      {lines.length > 0 ? (
        <div className="stack" data-testid={`ideas-result-${id}`}>
          {lines.map((line, k) => (
            <label className="nodrag" key={k}>
              <input
                type="radio"
                name={`ideas-pick-${id}`}
                data-testid={`ideas-pick-${id}-${k + 1}`}
                checked={params.pick === k + 1}
                onChange={() => setParams({ pick: k + 1 })}
              />{" "}
              {line}
            </label>
          ))}
          <p className="hint">Đổi lựa chọn rồi bấm ▶ Chạy: không tốn lượt (3 ý tưởng đã lưu).</p>
        </div>
      ) : (
        <div className="preview empty small">{params.own?.trim() ? "Đang dùng ý tưởng riêng" : "Bấm ▶ Chạy để đạo diễn AI đề xuất 3 ý tưởng"}</div>
      )}
      <label className="field">
        <span>Hoặc ý tưởng riêng của bạn (có chữ ở đây thì không hỏi Muse)</span>
        <textarea className="nodrag" rows={3} data-testid={`ideas-own-${id}`} value={params.own ?? ""} onChange={(e) => setParams({ own: e.target.value })} />
      </label>
      <ProviderSelect id={id} value={params.provider} onChange={(provider) => setParams({ provider })} />
    </div>
  );
}
