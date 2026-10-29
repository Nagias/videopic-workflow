import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { mediaUrl } from "../../shared/api";
import { orderAfterMove, orderSourceList, shiftTarget } from "../../shared/source-order";
import { useEditor, type NodeViewProps } from "../../features/editor/ui/node-kit";
import type { FilmCombineParams } from "./definition";

// Dải thứ tự clip: mỗi clip nối vào cổng Clip là một ảnh nhỏ (khung đầu của cảnh nếu có, không thì ô "clip"), đúng thứ tự máy chủ
// sẽ ghép (orderSourceList, cùng hàm với orderSources() của máy chủ). Kéo thả (hoặc Alt+mũi tên khi đang chọn một clip) ghi
// params.order; chưa đổi gì thì không ghi, nên thứ tự mặc định (theo toạ độ) không bị "đóng đinh" khi chưa ai kéo.
function OrderStrip({ id, params, setParams, incoming }: Pick<NodeViewProps<FilmCombineParams>, "id" | "params" | "setParams" | "incoming">) {
  const editor = useEditor();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLElement>());
  // Clip vừa đổi chỗ bằng bàn phím: React dời phần tử trong DOM nên tiêu điểm rơi mất, đặt lại sau khi vẽ.
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    const target = refocus.current;
    refocus.current = null;
    if (target) items.current.get(target)?.focus();
  });

  const wires = incoming.filter((w) => w.port === "clips");
  const clips = orderSourceList(
    wires.filter((w, i) => wires.findIndex((x) => x.source === w.source) === i),
    params.order,
    (nodeId) => wires.find((w) => w.source === nodeId)?.position,
  );
  const shown = clips.map((c) => c.source);

  const move = (clipId: string, to: number) => {
    const next = orderAfterMove(params.order, shown, clipId, to);
    if (next.slice(0, shown.length).every((x, i) => x === shown[i])) return;
    setParams({ order: next });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>, clipId: string, index: number) => {
    if (!e.altKey) return;
    const by = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : 0;
    if (by === 0) return;
    e.preventDefault();
    refocus.current = clipId;
    move(clipId, shiftTarget(index, by, shown.length));
  };

  const onDrop = (e: DragEvent<HTMLElement>, index: number) => {
    e.preventDefault();
    const clipId = e.dataTransfer.getData("text/plain");
    setDragging(null);
    setOver(null);
    if (shown.includes(clipId)) move(clipId, index);
  };

  if (clips.length === 0) {
    return (
      <p className="hint" data-testid={`order-strip-${id}`}>
        Chưa nối clip nào vào cổng Clip.
      </p>
    );
  }
  return (
    <div className="stack">
      <span className="fieldlabel">Thứ tự ghép</span>
      <ol className="order-strip" data-testid={`order-strip-${id}`} aria-label="Thứ tự các clip trong phim">
        {clips.map((clip, index) => {
          const frame = editor.stateOf(clip.source)?.output?.frame;
          return (
            <li
              key={clip.source}
              ref={(el) => {
                if (el) items.current.set(clip.source, el);
                else items.current.delete(clip.source);
              }}
              className={`order-item${dragging === clip.source ? " dragging" : ""}${over === clip.source && dragging !== clip.source ? " over" : ""}`}
              data-testid={`order-item-${id}-${clip.source}`}
              draggable
              tabIndex={0}
              aria-label={`Clip ${index + 1}: ${clip.label}. Alt cùng mũi tên để đổi chỗ`}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", clip.source);
                e.dataTransfer.effectAllowed = "move";
                setDragging(clip.source);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOver(clip.source);
              }}
              onDragLeave={() => setOver((cur) => (cur === clip.source ? null : cur))}
              onDrop={(e) => onDrop(e, index)}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onKeyDown={(e) => onKeyDown(e, clip.source, index)}
            >
              {frame?.kind === "image" ? (
                <img src={mediaUrl(frame.mediaId)} alt="" draggable={false} loading="lazy" />
              ) : (
                <span className="order-clip">clip</span>
              )}
              <span className="order-no">{index + 1}</span>
              <span className="order-label">{clip.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="hint">Kéo một clip tới chỗ khác để đổi thứ tự (hoặc chọn clip rồi bấm Alt+mũi tên). Thứ tự này là thứ tự trong phim.</p>
    </div>
  );
}

export function FilmCombineView({ id, params, setParams, incoming, state }: NodeViewProps<FilmCombineParams>) {
  const video = state?.output?.video;
  return (
    <div className="stack">
      <OrderStrip id={id} params={params} setParams={setParams} incoming={incoming} />
      <label className="check nodrag">
        <input
          type="checkbox"
          data-testid={`film-combine-brightness-${id}`}
          checked={params.fixBrightness ?? true}
          onChange={(e) => setParams({ fixBrightness: e.target.checked })}
        />
        Bù độ sáng giữa các cảnh (Muse làm cuối clip tối dần)
      </label>
      {video?.kind === "video" ? (
        <video className="preview nodrag" data-testid={`film-combine-video-${id}`} src={mediaUrl(video.mediaId)} controls preload="metadata" />
      ) : (
        <div className="preview empty">Chưa có phim</div>
      )}
    </div>
  );
}
