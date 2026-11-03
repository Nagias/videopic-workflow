import type { NodeRun } from "../../core/node-runtime";
import { generateReferenceSet } from "../../core/reference-set";
import { LOCATION_SHEET } from "../../shared/prompts";
import { lookOf, photoSet, type LocationParams } from "./definition";

export const run: NodeRun<LocationParams> = async (ctx, _inputs, params) => {
  const real = photoSet(params);
  if (real) {
    ctx.report(`Dùng ${real.images.length} ảnh thật bối cảnh, không gọi dịch vụ`);
    return { location: real };
  }
  const look = lookOf(params);
  const set = await generateReferenceSet(ctx, params.provider, "location", params.description, LOCATION_SHEET(params.description, look), look);
  return { location: set };
};
