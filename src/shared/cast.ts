import { z } from "zod";

// Một nhân vật trong Dàn nhân vật (node `cast`): tên gọi dùng trong kịch bản, ngoại hình, kích thước thật, tính cách.
export const CastMemberSchema = z.object({
  name: z.string().trim().min(1, "Nhân vật chưa có tên"),
  look: z.string().trim().min(10, "Ngoại hình nhân vật quá ngắn (cần hình dáng, màu, phụ kiện)"),
  size: z.string().trim().min(3, "Chưa ghi kích thước nhân vật (vd cao 40 cm)"),
  trait: z.string().trim(),
});
export type CastMember = z.infer<typeof CastMemberSchema>;

export const MAX_CAST = 6;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const findMember = (members: readonly CastMember[], name: string): CastMember | undefined => members.find((m) => same(m.name, name));

// Tên trùng (không phân biệt hoa thường) trong dàn: kịch bản gọi nhân vật bằng tên nên tên phải khác nhau.
export function castProblems(members: readonly CastMember[]): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const m of members) {
    const key = m.name.trim().toLowerCase();
    if (seen.has(key)) problems.push(`Nhân vật trùng tên "${m.name.trim()}"`);
    seen.add(key);
  }
  return problems;
}
