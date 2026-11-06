import { optionalInput, requireInput, type NodeRun } from "../../core/node-runtime";
import { askText } from "../../core/text-ask";
import { ideasPrompt, ideasRepairPrompt, ideaText, type EpisodeIdea } from "../../shared/cartoon-prompts";
import { parseIdeas } from "../../shared/episode-format";
import { IDEAS_MAX_TRIES, type IdeasParams } from "./definition";

export const run: NodeRun<IdeasParams> = async (ctx, inputs, params) => {
  const own = params.own.trim();
  if (own) {
    ctx.report("Dùng ý tưởng riêng, không gọi dịch vụ");
    return { idea: { kind: "text", text: own }, options: { kind: "text", text: own } };
  }
  const cast = requireInput(inputs, "character", "imageset");
  if (!cast.members?.length) throw new Error("Ý tưởng tập cần node Dàn nhân vật (phim hoạt hình) nối vào cổng Dàn nhân vật");
  const location = optionalInput(inputs, "location", "imageset")?.description;
  const provider = ctx.providers.get(params.provider);
  const prompt = ideasPrompt({ members: cast.members, rules: cast.rules ?? "", ...(location ? { location } : {}), hint: params.hint });
  const result = await ctx.step(["ideas", provider.id, prompt], async () => {
    const r = await askText(ctx, provider, { label: "Ý tưởng tập", prompt, parse: parseIdeas, repair: ideasRepairPrompt, maxTries: IDEAS_MAX_TRIES });
    return { json: JSON.stringify(r.value) };
  });
  const ideas = JSON.parse(result.json) as EpisodeIdea[];
  const chosen = ideas[params.pick - 1];
  if (!chosen) throw new Error(`Không có ý tưởng số ${params.pick}`);
  return {
    idea: { kind: "text", text: ideaText(chosen) },
    options: { kind: "text", text: ideas.map((i, k) => `${k + 1}. ${ideaText(i)}`).join("\n") },
  };
};
