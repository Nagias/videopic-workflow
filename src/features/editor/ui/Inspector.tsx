import type { Edge } from "@xyflow/react";
import { useState } from "react";
import { webNodes } from "../../../nodes/registry.web";
import { mediaUrl, type RunNodeState } from "../../../shared/api";
import { fmtSec } from "../../../shared/card-line";
import { SHOT_SIZES } from "../../../shared/director";
import type { AnyNodeDefinition } from "../../../shared/node-definition";
import type { PortValue } from "../../../shared/ports";
import type { FlowNode } from "./GraphNode";
import { iconOf } from "./NodeCard";
import { NodeErrorBoundary } from "./NodeErrorBoundary";
import { STATUS_LABEL, useEditor } from "./node-kit";
import { promptPreview } from "./prompt-preview";

type Tab = "params" | "result" | "prompt";

function ValueView({ value }: { value: PortValue }) {
  switch (value.kind) {
    case "video":
      return (
        <div className="stack">
          <video className="preview" src={mediaUrl(value.mediaId)} controls preload="metadata" />
          <span className="hint">{fmtSec(value.durationSec)}</span>
        </div>
      );
    case "image":
      return <img className="preview" src={mediaUrl(value.mediaId)} alt="" loading="lazy" />;
    case "imageset":
      return (
        <div className="gallery">
          {value.images.map((img) => (
            <figure key={img.mediaId}>
              <a href={mediaUrl(img.mediaId)} target="_blank" rel="noreferrer">
                <img src={mediaUrl(img.mediaId)} alt={img.view} loading="lazy" />
              </a>
              <figcaption>{img.view}</figcaption>
            </figure>
          ))}
        </div>
      );
    case "props":
      return (
        <div className="gallery">
          {value.items.flatMap((item) =>
            item.images.map((img) => (
              <figure key={img.mediaId}>
                <a href={mediaUrl(img.mediaId)} target="_blank" rel="noreferrer">
                  <img src={mediaUrl(img.mediaId)} alt={item.name} loading="lazy" />
                </a>
                <figcaption>
                  {item.name}: {img.state}
                </figcaption>
              </figure>
            )),
          )}
        </div>
      );
    case "text":
      return <pre className="resulttext">{value.text}</pre>;
    case "shotlist":
      return (
        <ol className="resultlist">
          {value.shots.map((s) => (
            <li key={s.id}>
              <strong>{SHOT_SIZES[s.size].label}</strong> · {s.motion}
            </li>
          ))}
        </ol>
      );
    case "propspec":
      return (
        <ul className="resultlist">
          {value.items.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong> ({p.states.join(" → ")})
            </li>
          ))}
        </ul>
      );
    case "storyboard":
      return <p className="hint">Storyboard {value.shots.length} cảnh</p>;
  }
}

// Tab Kết quả: mọi đầu ra của lần chạy mới nhất (video, ảnh, chữ…), kèm thông báo và lỗi đầy đủ (trên thẻ chỉ có một dòng).
function ResultTab({ id, definition, state }: { id: string; definition: AnyNodeDefinition; state: RunNodeState | undefined }) {
  if (!state) return <p className="hint">Chưa có kết quả. Bấm ▶ Chạy để node này tạo kết quả.</p>;
  const outputs = Object.entries(state.output ?? {});
  return (
    <div className="stack">
      <div className="stack" data-testid={`result-media-${id}`}>
        {outputs.length === 0 ? <p className="hint">Chưa có đầu ra.</p> : null}
        {outputs.map(([port, value]) => (
          <div className="stack" key={port}>
            <span className="fieldlabel">{definition.outputs.find((p) => p.name === port)?.label ?? port}</span>
            <ValueView value={value} />
          </div>
        ))}
      </div>
      {state.message ? (
        <p className="resultmsg" data-testid={`result-message-${id}`}>
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p className="resulterr" data-testid={`result-error-${id}`}>
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function PromptTab({ node, nodes, edges }: { node: FlowNode; nodes: FlowNode[]; edges: Edge[] }) {
  const editor = useEditor();
  const preview = promptPreview(node.id, nodes, edges, (nid) => editor.stateOf(nid)?.output);
  if ("note" in preview) return <p className="hint">{preview.note}</p>;
  return (
    <div className="stack">
      <p className="hint">Đúng chữ sẽ gửi Muse khi chạy (chỉ đọc). Sửa ở tab Thông số.</p>
      {preview.sections.map((s) => (
        <div className="stack" key={s.title}>
          <span className="fieldlabel">{s.title}</span>
          <pre className="resulttext">{s.text}</pre>
        </div>
      ))}
    </div>
  );
}

function InspectorBody({ node, nodes, edges }: { node: FlowNode; nodes: FlowNode[]; edges: Edge[] }) {
  const editor = useEditor();
  const [tab, setTab] = useState<Tab>("params");
  const impl = webNodes[node.type ?? ""];
  const state = editor.stateOf(node.id);
  if (!impl) return <div className="inspector" data-testid="inspector">Loại node lạ: {node.type}</div>;
  const { definition, View } = impl;
  const tabs: { id: Tab; label: string; testid: string }[] = [
    { id: "params", label: "Thông số", testid: "inspector-tab-params" },
    { id: "result", label: "Kết quả", testid: "inspector-tab-result" },
    { id: "prompt", label: "Prompt gửi Muse", testid: "inspector-tab-prompt" },
  ];
  return (
    <div className="inspector" data-testid="inspector">
      <div className="ih">
        <i>{iconOf(node.type ?? "")}</i>
        <h3>{editor.titleOf(node.id, definition.label, node.data.params)}</h3>
        <span className={`st st-${state?.status ?? "idle"}`}>{state ? STATUS_LABEL[state.status] : "Chưa chạy"}</span>
      </div>
      <div className="ith" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} data-testid={t.testid} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ib">
        <NodeErrorBoundary>
          {tab === "params" ? (
            <View
              id={node.id}
              params={node.data.params}
              setParams={(patch) => editor.setParams(node.id, patch)}
              replaceParams={(params) => editor.replaceParams(node.id, params)}
              state={state}
            />
          ) : null}
          {tab === "result" ? <ResultTab id={node.id} definition={definition} state={state} /> : null}
          {tab === "prompt" ? <PromptTab node={node} nodes={nodes} edges={edges} /> : null}
        </NodeErrorBoundary>
      </div>
    </div>
  );
}

// Khung bên phải: sửa thông số, xem kết quả và prompt gửi Muse của node đang chọn. Không chọn node nào thì không hiện gì.
export function Inspector({ nodeId, nodes, edges }: { nodeId: string | null; nodes: FlowNode[]; edges: Edge[] }) {
  const node = nodeId === null ? undefined : nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  // key theo node: chọn node khác thì quay về tab Thông số.
  return <InspectorBody key={node.id} node={node} nodes={nodes} edges={edges} />;
}
