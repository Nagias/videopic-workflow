import type { NodeRun } from "../../core/node-runtime";
import { generateReferenceSet } from "../../core/reference-set";
import { CHARACTER_SHEET, DEFAULT_LOOK } from "../../shared/prompts";
import type { CharacterParams } from "./definition";

export const run: NodeRun<CharacterParams> = async (ctx, _inputs, params) => {
  const set = await generateReferenceSet(ctx, params.provider, "character", params.description, CHARACTER_SHEET(params.description, DEFAULT_LOOK));
  return { character: set };
};
