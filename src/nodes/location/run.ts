import type { NodeRun } from "../../core/node-runtime";
import { generateReferenceSet } from "../../core/reference-set";
import { LOCATION_VIEWS, type LocationParams } from "./definition";

export const run: NodeRun<LocationParams> = async (ctx, _inputs, params) => {
  const set = await generateReferenceSet(ctx, params.provider, "location", params.description, LOCATION_VIEWS(params.description), "attach");
  return { location: set };
};
