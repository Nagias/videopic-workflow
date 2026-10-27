import type { NodeRun } from "../../core/node-runtime";
import { generateReferenceSet } from "../../core/reference-set";
import { CHARACTER_VIEWS, type CharacterParams } from "./definition";

export const run: NodeRun<CharacterParams> = async (ctx, _inputs, params) => {
  const set = await generateReferenceSet(ctx, params.provider, "character", params.description, CHARACTER_VIEWS(params.description));
  return { character: set };
};
