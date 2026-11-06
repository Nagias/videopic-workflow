import { z } from "zod";
import type { EpisodeIdea, EpisodeOutline } from "./cartoon-prompts";
import { findMember, type CastMember } from "./cast";
import { checkShotList, ShotSchema, type Shot } from "./director";
import { PropSpecItemSchema, propSpecProblems, type PropSpecItem } from "./ports";
import { extractJsonBlock } from "./writer-format";

// Đọc câu trả lời chữ của Ý tưởng tập, Dàn ý, Biên kịch hoạt hình theo đợt (thiết kế 2026-11-06): lấy khối JSON,
// kiểm cấu trúc và luật; sai thì trả danh sách lỗi để nhờ Muse sửa trong cùng chat.

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "json"}: ${i.message}`);

function json(text: string): { ok: true; value: unknown } | { ok: false; errors: string[] } {
  try {
    return { ok: true, value: extractJsonBlock(text) };
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  }
}

const IdeaSchema = z.object({
  title: z.string().trim().min(2, "thiếu tên ý tưởng"),
  logline: z.string().trim().min(10, "tóm tắt quá ngắn"),
  escalation: z.string().trim().min(5, "thiếu các đợt leo thang"),
  twist: z.string().trim().min(5, "thiếu cú chốt"),
});

export function parseIdeas(text: string): Parsed<EpisodeIdea[]> {
  const j = json(text);
  if (!j.ok) return j;
  const r = z.object({ ideas: z.array(IdeaSchema).min(3, "cần đúng 3 ý tưởng") }).safeParse(j.value);
  return r.success ? { ok: true, value: r.data.ideas.slice(0, 3) } : { ok: false, errors: issues(r.error) };
}

const OutlineSchema = z.object({
  title: z.string().trim().min(2, "thiếu tên tập"),
  props: z.array(z.object({ name: z.string().trim().min(1), size: z.string().trim().min(1, "đồ vật thiếu kích thước") })).default([]),
  parts: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        beats: z
          .array(
            z.object({
              from: z.number().int(),
              to: z.number().int(),
              what: z.string().trim().min(5),
              end: z.string().trim().min(3, "đợt thiếu cuối đợt (ai ở đâu, đồ vật ở đâu)"),
            }),
          )
          .min(1, "phần chưa có đợt nào"),
      }),
    )
    .length(3, "dàn ý phải đúng 3 phần: Gây chuyện, Leo thang, Chốt"),
});

// Các đợt phải phủ kín cảnh 1..shotCount, nối liền, không chồng.
export function parseOutline(text: string, shotCount: number): Parsed<EpisodeOutline> {
  const j = json(text);
  if (!j.ok) return j;
  const r = OutlineSchema.safeParse(j.value);
  if (!r.success) return { ok: false, errors: issues(r.error) };
  const errors: string[] = [];
  let next = 1;
  for (const b of r.data.parts.flatMap((p) => p.beats)) {
    if (b.from !== next) errors.push(`đợt "${b.what.slice(0, 40)}" bắt đầu ở cảnh ${b.from}, phải là cảnh ${next}`);
    if (b.to < b.from) errors.push(`đợt "${b.what.slice(0, 40)}" có cảnh cuối ${b.to} nhỏ hơn cảnh đầu ${b.from}`);
    next = Math.max(next, b.to + 1);
  }
  if (next !== shotCount + 1) errors.push(`các đợt phải phủ đúng cảnh 1 đến ${shotCount} (đang đến ${next - 1})`);
  return errors.length ? { ok: false, errors } : { ok: true, value: r.data };
}

export type EpisodeBatch = { shots: Shot[]; props: PropSpecItem[] };

const BatchSchema = z.object({ props: z.array(PropSpecItemSchema).default([]), shots: z.array(z.unknown()) });

const idOf = (n: number) => `c${String(n).padStart(2, "0")}`;

// Một đợt cảnh from..to. prev: các cảnh đã duyệt trước đợt này; known: đồ vật đã khai báo. Mã cảnh đánh lại liên tục
// (Muse hay đánh sai mã, không bắt viết lại vì chuyện đó). Trả về chỉ các cảnh và đồ vật MỚI của đợt.
export function parseEpisodeBatch(
  text: string,
  a: { from: number; to: number; members: readonly CastMember[]; prev: Shot[]; known: PropSpecItem[] },
): Parsed<EpisodeBatch> {
  const j = json(text);
  if (!j.ok) return j;
  const r = BatchSchema.safeParse(j.value);
  if (!r.success) return { ok: false, errors: issues(r.error) };
  const want = a.to - a.from + 1;
  const errors: string[] = [];
  if (r.data.shots.length !== want) errors.push(`đợt này phải có đúng ${want} cảnh (cảnh ${a.from} đến ${a.to}), đang có ${r.data.shots.length}`);
  const shots: Shot[] = [];
  r.data.shots.slice(0, want).forEach((raw, i) => {
    const n = a.from + i;
    const base = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const parsed = ShotSchema.safeParse({ props: "", start: "", cast: [], ...base, id: idOf(n) });
    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((x) => `Cảnh ${n} ${x.path.join(".")}: ${x.message}`));
      return;
    }
    const s = parsed.data;
    const cast = s.cast ?? [];
    if (s.subject === "hands") errors.push(`Cảnh ${n}: subject chỉ được là "character" hoặc "none"`);
    if (s.subject === "character" && cast.length === 0) errors.push(`Cảnh ${n}: có nhân vật nhưng cast rỗng — ghi tên nhân vật có mặt`);
    if (s.subject === "none" && cast.length > 0) errors.push(`Cảnh ${n}: subject "none" thì cast phải rỗng`);
    for (const name of cast) {
      if (!findMember(a.members, name)) errors.push(`Cảnh ${n}: "${name}" không có trong dàn nhân vật (${a.members.map((m) => m.name).join(", ")})`);
    }
    if (!s.end?.trim()) errors.push(`Cảnh ${n}: thiếu end (khoảnh khắc cuối cảnh: ai ở đâu, đồ vật ở đâu)`);
    shots.push({ ...s, cast: cast.map((name) => findMember(a.members, name)?.name ?? name) });
  });
  const same = (x: string, y: string) => x.trim().toLowerCase() === y.trim().toLowerCase();
  const fresh = r.data.props.filter((p) => !a.known.some((k) => same(k.name, p.name)));
  errors.push(...propSpecProblems(fresh));
  if (errors.length === 0) {
    const all = [...a.known, ...fresh].map((p) => ({ name: p.name, states: p.states }));
    // Luật cả chuỗi (nối, trạng thái đồ vật liên tục) trên các cảnh đã có + đợt này; cảnh cũ đã đạt nên lỗi thuộc đợt này.
    errors.push(...checkShotList([...a.prev, ...shots], all).errors);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: { shots, props: fresh } };
}
