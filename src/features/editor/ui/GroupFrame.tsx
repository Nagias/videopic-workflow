import { Handle, Position, type NodeProps } from "@xyflow/react";
import { PORT_KIND_LABEL } from "../../../shared/ports";
import type { FlowNode } from "./GraphNode";

// Khung nét đứt quanh một nhóm thẻ (groups.ts): tiêu đề ở trên, kéo tiêu đề thì cả nhóm đi theo (Editor: onNodesChange).
// Dây từ ngoài vào nhiều thẻ trong nhóm được vẽ gộp thành một dây tới cổng `in-<loại>` ở mép trái khung.
export function GroupFrame({ data, selected }: NodeProps<FlowNode>) {
  const frame = data.frame;
  if (!frame) return null;
  const { groupId, title, rule, inKinds } = frame;
  return (
    <div className={`group-frame ${frame.scene ? "scene" : "manual"} ${selected ? "selected" : ""}`} data-testid={`group-${groupId}`}>
      <div className="group-head">
        <div className="group-title" data-testid={`group-title-${groupId}`}>
          {title}
        </div>
        {rule ? (
          <div className={`group-rule ${rule.ok ? "ok" : "warn"}`} data-testid={`group-rule-${groupId}`}>
            {rule.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        ) : null}
      </div>
      {inKinds.map((kind, i) => (
        <Handle
          key={kind}
          type="target"
          position={Position.Left}
          id={`in-${kind}`}
          isConnectable={false}
          className={`handle kind-${kind}`}
          title={PORT_KIND_LABEL[kind]}
          style={{ top: `${((i + 1) / (inKinds.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}
