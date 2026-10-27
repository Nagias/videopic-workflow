import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import type { PromptParams } from "./definition";

export function PromptView({ id, params, setParams }: NodeViewProps<PromptParams>) {
  return (
    <label className="field">
      <span>Mô tả cảnh</span>
      <textarea
        className="nodrag nowheel"
        data-testid={`prompt-text-${id}`}
        rows={6}
        value={params.text ?? ""}
        placeholder="Ví dụ: A lush primeval rainforest at sunrise, slow dolly forward"
        onChange={(e) => setParams({ text: e.target.value })}
      />
    </label>
  );
}
