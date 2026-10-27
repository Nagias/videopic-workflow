import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { webNodes } from "../../../nodes/registry.web";
import { PORT_KIND_LABEL } from "../../../shared/ports";
import { STATUS_LABEL, useEditor } from "./node-kit";

export type FlowNodeData = { params: Record<string, unknown> };
export type FlowNode = Node<FlowNodeData>;

export function GraphNode({ id, type, data, selected }: NodeProps<FlowNode>) {
  const editor = useEditor();
  const impl = webNodes[type];
  const state = editor.stateOf(id);
  if (!impl) return <div className="gnode status-failed">Loại node lạ: {type}</div>;
  const { definition, View } = impl;
  const status = state?.status;

  return (
    <div className={`gnode ${selected ? "selected" : ""} status-${status ?? "idle"}`} data-testid={`node-${id}`}>
      <header className="gnode-head">
        <strong>{definition.label}</strong>
        <span className="badge" data-testid={`node-status-${id}`}>
          {status ? STATUS_LABEL[status] : "Chưa chạy"}
        </span>
      </header>
      {definition.inputs.map((p) => (
        <div className="port in" key={p.name}>
          <Handle type="target" position={Position.Left} id={p.name} className={`handle kind-${p.kind}`} />
          <span>
            {p.label} <em>{PORT_KIND_LABEL[p.kind]}</em>
          </span>
        </div>
      ))}
      <div className="gnode-body">
        <View id={id} params={data.params} setParams={(patch) => editor.setParams(id, patch)} state={state} />
      </div>
      {state?.message && status !== "failed" ? (
        <div className="node-message" data-testid={`node-message-${id}`}>
          {state.message}
        </div>
      ) : null}
      {state?.error ? (
        <div className="node-error" data-testid={`node-error-${id}`}>
          {state.error}
        </div>
      ) : null}
      {definition.outputs.map((p) => (
        <div className="port out" key={p.name}>
          <span>
            {p.label} <em>{PORT_KIND_LABEL[p.kind]}</em>
          </span>
          <Handle type="source" position={Position.Right} id={p.name} className={`handle kind-${p.kind}`} />
        </div>
      ))}
    </div>
  );
}
