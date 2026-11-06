import { z } from "zod";
import { CAST_SHEET, CARTOON_VERSION } from "../../shared/cartoon-prompts";
import { castProblems, CastMemberSchema, MAX_CAST } from "../../shared/cast";
import { shorten } from "../../shared/card-line";
import { defineNode } from "../../shared/node-definition";
import { PROVIDER_IDS } from "../../shared/providers";
import { CartoonStyleSchema, FILM_STYLE_LABEL } from "../../shared/styles";

// Dàn nhân vật của một loạt phim hoạt hình (thiết kế 2026-11-06 mục 3.3): phong cách, nhiều nhân vật có kích thước thật,
// luật loạt phim. Ra bộ ảnh vai "character" nên cắm thẳng vào cổng Nhân vật của Biên kịch, Cảnh, Ý tưởng, Dàn ý.
export const params = z.object({
  name: z.string().optional(),
  style: CartoonStyleSchema,
  members: z
    .array(CastMemberSchema)
    .min(1, "Chưa có nhân vật nào")
    .max(MAX_CAST, `Nhiều nhất ${MAX_CAST} nhân vật`)
    .superRefine((members, ctx) => {
      for (const message of castProblems(members)) ctx.addIssue({ code: "custom", message });
    }),
  rules: z.string(),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
});
export type CastParams = z.infer<typeof params>;

export const definition = defineNode<CastParams>({
  type: "cast",
  label: "Dàn nhân vật",
  description:
    "Phim hoạt hình: nhiều nhân vật với kích thước thật, phong cách vẽ và luật loạt phim. Tạo ảnh cả dàn đứng đúng tỉ lệ rồi từng nhân vật, để mọi cảnh giữ đúng hình dáng và to nhỏ.",
  inputs: [],
  outputs: [{ name: "character", kind: "imageset", label: "Dàn nhân vật" }],
  // Mọi prompt hoạt hình: node phía sau (Ý tưởng, Dàn ý, Biên kịch, Cảnh) đổi khoá theo khi prompt hoạt hình đổi.
  cacheVersion: CARTOON_VERSION,
  params,
  defaults: { name: "", style: "hoat-hinh-2d", members: [], rules: "", provider: "fake" },
  cardLine: (p, out) => {
    const members = Array.isArray(p.members) ? p.members : [];
    const who =
      shorten(p.name, 24) ||
      shorten(
        members
          .map((m) => m?.name)
          .filter(Boolean)
          .join(", "),
        30,
      ) ||
      "chưa có nhân vật";
    const style = FILM_STYLE_LABEL[p.style] ?? "";
    const set = out?.character;
    return [who, style, set?.kind === "imageset" ? `${set.images.length} ảnh` : ""].filter(Boolean).join(" · ");
  },
  // 1 ảnh cả dàn + 1 ảnh mỗi nhân vật.
  estimate: (p) => ({ image: CAST_SHEET(p.members, p.style).length, video: 0, text: 0 }),
});
