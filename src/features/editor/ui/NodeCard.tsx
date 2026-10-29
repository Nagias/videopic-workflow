import { useNodeConnections, useStore } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { webNodes } from "../../../nodes/registry.web";
import { mediaUrl, type RunNodeState } from "../../../shared/api";
import { fmtSec } from "../../../shared/card-line";
import type { CardWires } from "../../../shared/node-definition";
import { pickCardMedia, videoSecondsOf, type CardMedia } from "./card-media";
import { STATUS_LABEL, useEditor } from "./node-kit";

// Dưới mức phóng này thẻ chỉ còn ảnh và tên (đỡ nặng máy khi canvas có hàng chục thẻ).
export const COMPACT_ZOOM = 0.45;

// Đang phóng nhỏ quá mức (chỉ hiện ảnh và tên): dùng chung cho thẻ và các phần phụ của node (tên cổng).
export const useCompact = (): boolean => useStore((s) => s.transform[2] < COMPACT_ZOOM);

// Biểu tượng loại node (ký tự Unicode, không thêm thư viện biểu tượng). Loại lạ dùng ◇.
export const NODE_ICON: Record<string, string> = {
  prompt: "✎",
  "generate-video": "▶",
  character: "☺",
  location: "⌂",
  props: "◈",
  writer: "✦",
  scene: "▭",
  "film-combine": "⧉",
  film: "▤",
  shotlist: "☰",
};
export const iconOf = (type: string) => NODE_ICON[type] ?? "◇";

type Props = {
  id: string;
  type: string;
  params: Record<string, unknown>;
  state: RunNodeState | undefined;
  selected: boolean;
};

function Media({ media, compact, icon }: { media: CardMedia; compact: boolean; icon: string }) {
  switch (media.kind) {
    case "video":
      // Thu nhỏ thì chỉ vẽ ảnh khung (không dựng thẻ video nào): đỡ nặng máy.
      if (compact) return media.poster ? <img className="cmedia" src={mediaUrl(media.poster)} alt="" draggable={false} /> : <div className="cmedia cempty">▶</div>;
      return <video className="cmedia" src={mediaUrl(media.mediaId)} poster={media.poster ? mediaUrl(media.poster) : undefined} muted playsInline preload="metadata" />;
    case "image":
      return <img className="cmedia" src={mediaUrl(media.mediaId)} alt="" loading="lazy" draggable={false} />;
    case "imageset":
      return (
        <div className="cgrid g2">
          {media.mediaIds.map((m) => (
            <img key={m} src={mediaUrl(m)} alt="" loading="lazy" draggable={false} />
          ))}
        </div>
      );
    case "props":
      return (
        <div className="cgrid g3">
          {media.mediaIds.map((m) => (
            <img key={m} src={mediaUrl(m)} alt="" loading="lazy" draggable={false} />
          ))}
        </div>
      );
    case "text":
      return compact ? <div className="cmedia cempty">{icon}</div> : <div className="ctext">{media.text}</div>;
    case "empty":
      return <div className="cmedia cempty">{icon}</div>;
  }
}

// Thân thẻ node trên canvas: nhãn nổi phía trên (biểu tượng, tên, trạng thái), ảnh/video/chữ của kết quả mới nhất,
// chân thẻ một dòng. Thẻ không có ô nhập nào — sửa thông số ở khung bên phải (Inspector). Ngoại lệ duy nhất: Prompt,
// nháy đúp để sửa chữ ngay trên thẻ.
export function NodeCard({ id, type, params, state, selected }: Props) {
  const editor = useEditor();
  const impl = webNodes[type];
  const compact = useCompact();
  const connections = useNodeConnections({ handleType: "target" });
  const wires = useMemo<CardWires>(() => {
    const counts: Record<string, number> = {};
    for (const c of connections) if (c.targetHandle) counts[c.targetHandle] = (counts[c.targetHandle] ?? 0) + 1;
    return counts;
  }, [connections]);
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = editRef.current;
    if (editing && el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  if (!impl) return null;
  const { definition } = impl;
  const status = state?.status;
  const output = state?.output ?? undefined;
  const icon = iconOf(type);
  const title = editor.titleOf(id, definition.label, params);
  const media = pickCardMedia(type, params, output);
  const line = definition.cardLine?.(params, output, wires) ?? "";
  const seconds = videoSecondsOf(output);
  const duration = seconds !== undefined && !line.includes(fmtSec(seconds)) ? fmtSec(seconds) : "";
  const inProgress = status === "pending" || status === "running";
  const showMessage = Boolean(state?.message) && inProgress;
  const canEditText = type === "prompt";
  const text = typeof params.text === "string" ? params.text : "";

  return (
    <>
      <div className={`nlabel ${compact ? "compact" : ""}`} data-testid={`card-label-${id}`}>
        <i>{icon}</i>
        <span className="nname">{title}</span>
        <span className={`st st-${status ?? "idle"}`} data-testid={`node-status-${id}`}>
          {status ? STATUS_LABEL[status] : "Chưa chạy"}
        </span>
      </div>
      <div
        className={`card status-${status ?? "idle"} ${selected ? "selected" : ""} ${compact ? "compact" : ""}`}
        data-testid={`card-${id}`}
        onDoubleClick={canEditText ? () => setEditing(true) : undefined}
      >
        <div className="cbody">
          {editing && canEditText ? (
            <textarea
              ref={editRef}
              className="cedit nodrag nowheel"
              data-testid={`card-edit-${id}`}
              value={text}
              placeholder="Viết mô tả cảnh…"
              onChange={(e) => editor.setParams(id, { text: e.target.value })}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                e.stopPropagation();
                e.currentTarget.blur();
              }}
            />
          ) : canEditText && media.kind === "empty" ? (
            <div className="cmedia cempty hint-edit">{compact ? icon : "Nháy đúp để viết prompt"}</div>
          ) : (
            <Media media={media} compact={compact} icon={icon} />
          )}
          {editor.runNode ? (
            <button
              type="button"
              className="runbtn nodrag"
              data-testid={`card-run-${id}`}
              title="Chạy riêng node này"
              disabled={editor.busy}
              onClick={(e) => {
                e.stopPropagation();
                editor.runNode?.(id);
              }}
            >
              ▶
            </button>
          ) : null}
          {inProgress ? <div className="prog" /> : null}
        </div>
        <div className="cfoot">
          {showMessage ? (
            <span className="cm running" data-testid={`node-message-${id}`}>
              {state?.message}
            </span>
          ) : (
            <span className="cm">{line}</span>
          )}
          {duration ? <span className="cdur">{duration}</span> : null}
        </div>
        {state?.error ? (
          <div className="cerr" title={state.error} data-testid={`node-error-${id}`}>
            {state.error}
          </div>
        ) : null}
      </div>
    </>
  );
}
