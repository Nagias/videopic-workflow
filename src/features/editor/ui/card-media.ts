import type { NodeOutputs, PortValue } from "../../../shared/ports";

// Thân thẻ node là một bức ảnh: chọn cái đáng xem nhất trong kết quả mới nhất của node, theo thứ tự ưu tiên
// video → ảnh → bộ ảnh → đồ vật → chữ → ô trống.
export type CardMedia =
  | { kind: "video"; mediaId: string; poster?: string }
  | { kind: "image"; mediaId: string }
  | { kind: "imageset"; mediaIds: string[] }
  | { kind: "props"; mediaIds: string[] }
  | { kind: "text"; text: string }
  | { kind: "empty" };

const MAX_IMAGESET = 4;
const MAX_PROPS = 9;
const MAX_SHOT_LINES = 5;

const firstOf = <K extends PortValue["kind"]>(values: PortValue[], kind: K): Extract<PortValue, { kind: K }> | undefined =>
  values.find((v): v is Extract<PortValue, { kind: K }> => v.kind === kind);

export function pickCardMedia(type: string, params: Record<string, unknown>, output: NodeOutputs | null | undefined): CardMedia {
  // Node Prompt: thẻ hiện đúng chữ đang viết (kể cả khi chưa chạy), không đợi kết quả.
  if (type === "prompt") {
    const text = typeof params.text === "string" ? params.text.trim() : "";
    return text ? { kind: "text", text } : { kind: "empty" };
  }
  const values = Object.values(output ?? {});
  const video = firstOf(values, "video");
  // Ảnh khung của Cảnh (cổng frame) làm poster; node khác lấy ảnh đầu tiên nếu có.
  const image = output?.frame?.kind === "image" ? output.frame : firstOf(values, "image");
  if (video) return { kind: "video", mediaId: video.mediaId, ...(image ? { poster: image.mediaId } : {}) };
  if (image) return { kind: "image", mediaId: image.mediaId };
  const set = firstOf(values, "imageset");
  if (set && set.images.length > 0) return { kind: "imageset", mediaIds: set.images.slice(0, MAX_IMAGESET).map((i) => i.mediaId) };
  const props = firstOf(values, "props");
  const propIds = props?.items.flatMap((p) => (p.images[0] ? [p.images[0].mediaId] : [])).slice(0, MAX_PROPS) ?? [];
  if (propIds.length > 0) return { kind: "props", mediaIds: propIds };
  const text = firstOf(values, "text");
  if (text && text.text.trim()) return { kind: "text", text: text.text.trim() };
  const shots = firstOf(values, "shotlist");
  if (shots && shots.shots.length > 0) {
    return { kind: "text", text: shots.shots.slice(0, MAX_SHOT_LINES).map((s, i) => `${i + 1}. ${s.motion}`).join("\n") };
  }
  return { kind: "empty" };
}

// Thời lượng của video trong kết quả (giây), nếu có.
export function videoSecondsOf(output: NodeOutputs | null | undefined): number | undefined {
  const video = firstOf(Object.values(output ?? {}), "video");
  return video?.durationSec;
}
