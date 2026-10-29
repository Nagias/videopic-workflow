import { z } from "zod";
import { checkShotList, type KnownProp, type Shot } from "../../shared/director";
import { defineNode, type PreflightCtx, type PreflightIssue } from "../../shared/node-definition";
import { params as propsParams, rowsToSpec } from "../props/definition";
import { params as sceneParams } from "../scene/definition";

export const params = z.object({
  fixBrightness: z.boolean(),
  // Mã các node nguồn theo thứ tự ghép; nguồn không có ở đây xếp theo toạ độ (orderSources()).
  order: z.array(z.string()).optional(),
});
export type FilmCombineParams = z.infer<typeof params>;

// Danh sách cảnh mà một Ghép phim sẽ ghép, dựng lại từ tham số các node Cảnh cắm vào (đúng thứ tự ghép),
// để kiểm luật giữa các cảnh trước khi tốn lượt. Đi theo đúng thứ tự clip trong phim, clip không phải Cảnh giữ chỗ:
// - Cảnh có dây Nối tiếp phải nối đúng clip liền trước nó trong Ghép phim, sai thì lỗi (`errors`, nêu cả hai).
// - Cảnh chỉ là "chain" trong `shots` khi clip liền trước là Cảnh nó nối; liền trước là video khác (Kéo dài video)
//   thì coi là cảnh cắt có khung đầu là khung cuối video đó (như Cảnh tự kiểm), nên luật chủ thể/số cảnh nối liền
//   chỉ áp giữa hai Cảnh kề nhau trong phim. Trạng thái đồ vật vẫn phải liên tục trên cả phim.
// - `positions[i]`: vị trí (từ 1) của shots[i] trong phim, để báo lỗi đúng chỗ.
// known: từ node Đồ vật đầu tiên mà các cảnh cắm vào, đọc tham số như node Đồ vật đọc (rowsToSpec()).
// Đồ vật lấy danh sách từ Biên kịch (cổng spec có dây) thì chưa biết món nào trước khi chạy: known để trống (DEBT.md N-015).
// `errors` gắn vào đúng thẻ Cảnh liên quan (nodeId của Cảnh).
export function scenesFeeding(
  combineId: string,
  ctx: PreflightCtx,
): { shots: Shot[]; positions: number[]; errors: { nodeId: string; message: string }[]; known?: KnownProp[] } {
  const clips = ctx.sources(combineId, "clips");
  const shots: Shot[] = [];
  const positions: number[] = [];
  const errors: { nodeId: string; message: string }[] = [];
  const isScene = (id: string | undefined) => id !== undefined && ctx.planned.get(id)?.node.type === "scene";
  let propsNode: string | undefined;
  clips.forEach((src, i) => {
    const p = ctx.planned.get(src.source);
    if (!p || p.node.type !== "scene") return;
    const s = sceneParams.parse(p.params);
    const follow = ctx.sources(p.node.id, "follow")[0];
    const prev = clips[i - 1];
    const followsPrev = follow !== undefined && prev !== undefined && follow.source === prev.source && follow.sourceHandle === prev.sourceHandle;
    if (follow && !followsPrev) {
      const where = clips.some((c) => c.source === follow.source && c.sourceHandle === follow.sourceHandle)
        ? prev
          ? `đứng sau "${prev.source}" trong Ghép phim`
          : "đứng đầu Ghép phim"
        : `"${follow.source}" không có trong Ghép phim`;
      errors.push({ nodeId: p.node.id, message: `Cảnh "${p.node.id}" nối tiếp "${follow.source}" nhưng ${where}` });
    }
    const chain = followsPrev && isScene(prev?.source);
    shots.push({
      id: p.node.id,
      link: chain ? "chain" : "cut",
      size: s.size,
      angle: s.angle,
      move: s.move,
      subject: s.subject,
      start: follow && !chain ? s.start.trim() || "khung cuối clip trước" : s.start,
      motion: s.motion,
      props: s.props,
    });
    positions.push(i + 1);
    propsNode ??= ctx.sources(p.node.id, "props")[0]?.source;
  });
  const pr = propsNode === undefined ? undefined : ctx.planned.get(propsNode);
  if (pr?.node.type !== "props" || ctx.sources(pr.node.id, "spec").length > 0) return { shots, positions, errors };
  const known = rowsToSpec(propsParams.parse(pr.params).items).map((i) => ({ name: i.name, states: i.states }));
  return { shots, positions, errors, known };
}

export const definition = defineNode<FilmCombineParams>({
  type: "film-combine",
  label: "Ghép phim",
  description: "Ghép các clip (thường là clip của các node Cảnh) thành một video, theo thứ tự đã xếp; bù sáng giữa các cảnh.",
  // Không bắt buộc để đồ thị có nhóm Phân cảnh còn rỗng (Biên kịch chưa có kết quả) vẫn lập được kế hoạch;
  // chạy tới đây mà vẫn chưa có clip nào thì run.ts báo lỗi.
  inputs: [{ name: "clips", kind: "video", label: "Clip", multiple: true, optional: true }],
  outputs: [{ name: "video", kind: "video", label: "Phim" }],
  // Cùng vùng bước con với Dựng phim: cùng các phần thì bước ghép dùng lại phim đã ghép.
  stepScope: "film",
  params,
  defaults: { fixBrightness: true },
  estimate: () => ({ image: 0, video: 0, text: 0 }),
  // Luật giữa các cảnh (nối, trạng thái đồ vật liên tục, tên/trạng thái đồ vật) trên cả chuỗi cảnh cắm vào.
  preflight(ctx) {
    const { shots, positions, errors, known } = scenesFeeding(ctx.node.node.id, ctx);
    if (shots.length === 0) return errors;
    // checkShotList đánh số theo shots; đổi về mã node và vị trí clip trong phim. Lỗi của một cảnh gắn vào thẻ cảnh đó,
    // lỗi chung của cả chuỗi (không mở đầu bằng "Cảnh N:") ở lại Ghép phim.
    const checked = checkShotList(shots, known).errors.map((e): PreflightIssue => {
      const n = /^Cảnh (\d+):/.exec(e)?.[1];
      if (n === undefined) return e;
      const shot = shots[Number(n) - 1]!;
      return { nodeId: shot.id, message: e.replace(/^Cảnh \d+:/, `Cảnh "${shot.id}" (clip ${positions[Number(n) - 1]!}):`) };
    });
    return [...errors, ...checked];
  },
});
