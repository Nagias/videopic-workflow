import type { NodeRun } from "../../core/node-runtime";
import { checkShotList } from "../../shared/director";
import type { ShotListParams } from "./definition";

export const run: NodeRun<ShotListParams> = (ctx, _inputs, params) => {
  const { warnings } = checkShotList(params.shots);
  ctx.report(warnings.length ? `${params.shots.length} cảnh · lưu ý: ${warnings.join("; ")}` : `${params.shots.length} cảnh`);
  return Promise.resolve({ shots: { kind: "shotlist", shots: params.shots } });
};
