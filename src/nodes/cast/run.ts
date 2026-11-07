import type { NodeRun } from "../../core/node-runtime";
import { generateReferenceSet } from "../../core/reference-set";
import { CAST_SHEET, castDescription } from "../../shared/cartoon-prompts";
import type { CastParams } from "./definition";

export const run: NodeRun<CastParams> = async (ctx, _inputs, params) => {
  const set = await generateReferenceSet(ctx, params.provider, "character", castDescription(params.members), CAST_SHEET(params.members, params.style));
  return { character: { ...set, style: params.style, members: params.members, rules: params.rules.trim() } };
};
