import { optionalInput, requireInput, type NodeRun } from "../../core/node-runtime";
import { askText } from "../../core/text-ask";
import { outlinePrompt, outlineRepairPrompt, outlineText, type EpisodeOutline } from "../../shared/cartoon-prompts";
import { parseOutline } from "../../shared/episode-format";
import { OUTLINE_MAX_TRIES, type OutlineParams } from "./definition";

export const run: NodeRun<OutlineParams> = async (ctx, inputs, params) => {
  const own = params.own.trim();
  if (own) {
    ctx.report("Dùng dàn ý tự viết, không gọi dịch vụ");
    return {
      outline: {
        kind: "outline",
        title: own
          .split("\n")[0]!
          .replace(/^Tên tập:\s*/, "")
          .slice(0, 80),
        text: own,
        shotCount: params.shotCount,
      },
    };
  }
  const idea = requireInput(inputs, "idea", "text").text.trim();
  if (idea.length < 10) throw new Error("Ý tưởng tập quá ngắn để viết dàn ý");
  const cast = requireInput(inputs, "character", "imageset");
  if (!cast.members?.length) throw new Error("Dàn ý cần node Dàn nhân vật (phim hoạt hình) nối vào cổng Dàn nhân vật");
  const location = optionalInput(inputs, "location", "imageset")?.description;
  const provider = ctx.providers.get(params.provider);
  const prompt = outlinePrompt({ members: cast.members, rules: cast.rules ?? "", ...(location ? { location } : {}), idea, shotCount: params.shotCount });
  const result = await ctx.step(["outline", provider.id, prompt], async () => {
    const r = await askText(ctx, provider, {
      label: "Dàn ý",
      prompt,
      parse: (t) => parseOutline(t, params.shotCount),
      repair: outlineRepairPrompt,
      maxTries: OUTLINE_MAX_TRIES,
    });
    return { json: JSON.stringify(r.value) };
  });
  const o = JSON.parse(result.json) as EpisodeOutline;
  ctx.report(`Dàn ý: ${o.parts.reduce((n, p) => n + p.beats.length, 0)} đợt, ${params.shotCount} cảnh`);
  return { outline: { kind: "outline", title: o.title, text: outlineText(o), shotCount: params.shotCount } };
};
