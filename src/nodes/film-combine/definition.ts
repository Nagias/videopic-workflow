import { z } from "zod";
import { checkShotList, type KnownProp, type Shot } from "../../shared/director";
import { defineNode, type PreflightCtx } from "../../shared/node-definition";
import { params as propsParams, rowsToSpec } from "../props/definition";
import { params as sceneParams } from "../scene/definition";

export const params = z.object({
  fixBrightness: z.boolean(),
  // Mã các node nguồn theo thứ tự ghép; nguồn không có ở đây xếp theo toạ độ (orderSources()).
  order: z.array(z.string()).optional(),
});
export type FilmCombineParams = z.infer<typeof params>;

// Danh sách cảnh mà một Ghép phim sẽ ghép, dựng lại từ tham số các node Cảnh cắm vào (đúng thứ tự ghép),
// để kiểm luật giữa các cảnh trước khi tốn lượt. Nguồn không phải Cảnh (video khác) không có luật cảnh, bỏ qua.
// known: từ node Đồ vật đầu tiên mà các cảnh cắm vào, đọc tham số như node Đồ vật đọc (rowsToSpec()).
// Đồ vật lấy danh sách từ Biên kịch (cổng spec có dây) thì chưa biết món nào trước khi chạy: known để trống.
export function scenesFeeding(combineId: string, ctx: PreflightCtx): { shots: Shot[]; known?: KnownProp[] } {
  const shots: Shot[] = [];
  let propsNode: string | undefined;
  for (const src of ctx.sources(combineId, "clips")) {
    const p = ctx.planned.get(src.source);
    if (p?.node.type !== "scene") continue;
    const s = sceneParams.parse(p.params);
    shots.push({
      id: p.node.id,
      link: ctx.sources(p.node.id, "follow").length > 0 ? "chain" : "cut",
      size: s.size,
      angle: s.angle,
      move: s.move,
      subject: s.subject,
      start: s.start,
      motion: s.motion,
      props: s.props,
    });
    propsNode ??= ctx.sources(p.node.id, "props")[0]?.source;
  }
  const pr = propsNode === undefined ? undefined : ctx.planned.get(propsNode);
  if (pr?.node.type !== "props" || ctx.sources(pr.node.id, "spec").length > 0) return { shots };
  const known = rowsToSpec(propsParams.parse(pr.params).items).map((i) => ({ name: i.name, states: i.states }));
  return { shots, known };
}

export const definition = defineNode<FilmCombineParams>({
  type: "film-combine",
  label: "Ghép phim",
  description: "Ghép các clip (thường là clip của các node Cảnh) thành một video, theo thứ tự đã xếp; bù sáng giữa các cảnh.",
  inputs: [{ name: "clips", kind: "video", label: "Clip", multiple: true }],
  outputs: [{ name: "video", kind: "video", label: "Phim" }],
  // Cùng vùng bước con với Dựng phim: cùng các phần thì bước ghép dùng lại phim đã ghép.
  stepScope: "film",
  params,
  defaults: { fixBrightness: true },
  estimate: () => ({ image: 0, video: 0, text: 0 }),
  // Luật giữa các cảnh (nối, trạng thái đồ vật liên tục, tên/trạng thái đồ vật) trên cả chuỗi cảnh cắm vào.
  preflight(ctx) {
    const { shots, known } = scenesFeeding(ctx.node.node.id, ctx);
    if (shots.length === 0) return [];
    return checkShotList(shots, known).errors.map((e) => e.replace(/^Cảnh (\d+):/, (_, n: string) => `Cảnh ${n} ("${shots[Number(n) - 1]!.id}"):`));
  },
});
