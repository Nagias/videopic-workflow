import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { webNodes } from "../../../nodes/registry.web";
import { PORT_KIND_LABEL, type PortDef, type PortKind } from "../../../shared/ports";
import { cardWidthOf } from "./new-node";
import { NodeCard, useCompact } from "./NodeCard";
import { NodeErrorBoundary } from "./NodeErrorBoundary";
import { useEditor } from "./node-kit";

// Thông tin vẽ của khung nhóm (node "group-frame", groups.ts): chỉ có ở node khung, không bao giờ được lưu.
export type FrameInfo = {
  groupId: string;
  title: string;
  count: number;
  // Nhóm Phân cảnh (true) hay nhóm tay (false).
  scene: boolean;
  // Dòng kiểm luật đạo diễn; vắng khi chưa có kết quả ước tính.
  rule?: { ok: boolean; lines: string[] };
  // Loại dữ liệu của các dây gộp tới mép khung: mỗi loại một cổng vào `in-<loại>`.
  inKinds: PortKind[];
};
export type FlowNodeData = { params: Record<string, unknown>; frame?: FrameInfo };
export type FlowNode = Node<FlowNodeData>;

// Cổng nằm ở mép thẻ, rải đều theo chiều cao; tên cổng chỉ hiện khi rê chuột vào thẻ.
function Port({ port, side, index, count }: { port: PortDef; side: "in" | "out"; index: number; count: number }) {
  const top = `${((index + 1) / (count + 1)) * 100}%`;
  return (
    <>
      <Handle
        type={side === "in" ? "target" : "source"}
        position={side === "in" ? Position.Left : Position.Right}
        id={port.name}
        className={`handle kind-${port.kind}`}
        style={{ top }}
      />
      <span className={`plabel ${side} kind-${port.kind}`} style={{ top }}>
        {port.label} <em>{PORT_KIND_LABEL[port.kind]}</em>
      </span>
    </>
  );
}

export function GraphNode({ id, type, data, selected }: NodeProps<FlowNode>) {
  const editor = useEditor();
  const compact = useCompact();
  const impl = webNodes[type];
  const style = { width: cardWidthOf(type) };
  if (!impl) return <div className="gnode status-failed" style={style}>Loại node lạ: {type}</div>;
  const { definition } = impl;
  return (
    <div className={`gnode type-${type} ${compact ? "compact" : ""}`} style={style} data-testid={`node-${id}`}>
      <NodeErrorBoundary>
        <NodeCard id={id} type={type} params={data.params} state={editor.stateOf(id)} selected={Boolean(selected)} />
      </NodeErrorBoundary>
      {definition.inputs.map((p, i) => (
        <Port key={p.name} port={p} side="in" index={i} count={definition.inputs.length} />
      ))}
      {definition.outputs.map((p, i) => (
        <Port key={p.name} port={p} side="out" index={i} count={definition.outputs.length} />
      ))}
    </div>
  );
}
