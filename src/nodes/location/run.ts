import type { NodeRun } from "../../core/node-runtime";
import { generateReferenceSet } from "../../core/reference-set";
import { CARTOON_LOCATION_SHEET } from "../../shared/cartoon-prompts";
import { LOCATION_SHEET } from "../../shared/prompts";
import { isCartoon } from "../../shared/styles";
import { lookOf, photoSet, styleField, type LocationParams } from "./definition";

export const run: NodeRun<LocationParams> = async (ctx, _inputs, params) => {
  const real = photoSet(params);
  if (real) {
    ctx.report(`Dùng ${real.images.length} ảnh thật bối cảnh, không gọi dịch vụ`);
    return { location: real };
  }
  const look = lookOf(params);
  const sheet = (isCartoon(params.style) ? CARTOON_LOCATION_SHEET : LOCATION_SHEET)(params.description, look);
  const set = await generateReferenceSet(ctx, params.provider, "location", params.description, sheet, look);
  return { location: { ...set, ...styleField(params) } };
};
