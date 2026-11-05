import { z } from "zod";
import { shorten } from "../../shared/card-line";
import { defineNode, type EstimateKnown } from "../../shared/node-definition";
import { mediaIdOf, pickInput, propSpecProblems, PropSpecItemSchema, type PropItem, type PropSpecItem, type PropSpecValue } from "../../shared/ports";
import { codeVersion, DEFAULT_LOOK, propStatePrompt, propStillPrompt } from "../../shared/prompts";
import { PROVIDER_IDS } from "../../shared/providers";

// Một dòng gõ tay trong node: trạng thái viết cách nhau bằng dấu phẩy, trạng thái đầu là trạng thái gốc.
// photos: ảnh thật người dùng tải lên, theo tên trạng thái → mã ảnh (spec 2026-11-03 mục 3.2).
export const PropRowSchema = z.object({
  name: z.string(),
  description: z.string(),
  states: z.string(),
  photos: z.record(z.string(), z.array(z.string().min(1))).optional(),
});
export type PropRow = z.infer<typeof PropRowSchema>;

export const params = z.object({
  name: z.string().optional(),
  items: z.array(PropRowSchema),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
});
export type PropsParams = z.infer<typeof params>;

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const rowStates = (row: Pick<PropRow, "states">): string[] =>
  row.states
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function rowsToSpec(rows: PropRow[]): PropSpecItem[] {
  return rows.map((r) => ({ name: r.name.trim(), description: r.description.trim(), states: rowStates(r) }));
}

// Ảnh thật của một trạng thái (so tên bỏ khoảng trắng hai đầu, không phân biệt hoa thường).
export function photosFor(row: PropRow | undefined, state: string): string[] {
  return Object.entries(row?.photos ?? {})
    .filter(([key]) => sameText(key, state))
    .flatMap(([, ids]) => ids);
}

// Ảnh có tên trạng thái không còn khớp trạng thái nào (vd đã đổi tên trạng thái): không mất, giao diện báo để gắn lại.
export function orphanPhotos(row: PropRow): string[] {
  const states = rowStates(row);
  return Object.entries(row.photos ?? {})
    .filter(([key]) => !states.some((s) => sameText(s, key)))
    .flatMap(([, ids]) => ids);
}

// Ảnh thật đính kèm khi Muse vẽ trạng thái còn thiếu: tối đa 2 ảnh của trạng thái đầu tiên có ảnh, không có thì ảnh mồ côi.
export function basePhotos(row: PropRow | undefined, states: string[]): string[] {
  for (const s of states) {
    const found = photosFor(row, s);
    if (found.length) return found.slice(0, 2);
  }
  return row ? orphanPhotos(row).slice(0, 2) : [];
}

// allowEmpty: danh sách đến từ Biên kịch — kịch bản không cần đồ vật nào là hợp lệ.
export function checkSpec(items: PropSpecItem[], opts: { allowEmpty: boolean }): PropSpecItem[] {
  if (items.length === 0 && !opts.allowEmpty) throw new Error("Chưa có đồ vật nào (gõ trong node Đồ vật hoặc nối từ Biên kịch)");
  const parsed = items.map((item) => {
    const r = PropSpecItemSchema.safeParse(item);
    if (!r.success) throw new Error(`Đồ vật "${item.name || "?"}": ${r.error.issues.map((i) => i.message).join("; ")}`);
    return r.data;
  });
  const problems = propSpecProblems(parsed);
  if (problems.length) throw new Error(problems.join("; "));
  return parsed;
}

// Danh sách món node sẽ làm: từ Biên kịch (cổng spec) nếu có, không thì từ các dòng gõ tay. Kiểm bằng checkSpec() trước khi chạy.
export const specOf = (p: PropsParams, fromWriter: PropSpecValue | undefined): PropSpecItem[] => (fromWriter ? fromWriter.items : rowsToSpec(p.items));

// Dòng gõ tay của một món (để lấy ảnh thật). Món từ Biên kịch không có ảnh thật.
export const rowOf = (p: PropsParams, item: PropSpecItem, fromWriter: boolean): PropRow | undefined =>
  fromWriter ? undefined : p.items.find((r) => sameText(r.name, item.name));

// Khoá bước con ảnh trạng thái thứ idx của một món: theo mô tả món (không theo node), món giống hệt ở workflow khác dùng lại ảnh.
// base: ảnh thật đính kèm khi vẽ; rỗng thì khoá y hệt bản trước khi có ảnh thật (cache cũ vẫn trúng).
export const propStepKey = (providerId: string, item: PropSpecItem, idx: number, base: string[] = []): unknown[] => [
  "prop",
  providerId,
  item.name,
  item.description,
  item.states.slice(0, idx + 1),
  DEFAULT_LOOK,
  ...(base.length ? ["photos", ...base] : []),
];

// Kế hoạch từng trạng thái của một món: dùng ảnh thật, hoặc vẽ (khoá bước con + ảnh thật đính kèm).
// Một nơi duy nhất: run, estimate, predict cùng đi theo đây.
export type StatePlan = { state: string; photos: string[] } | { state: string; draw: { idx: number; key: unknown[]; base: string[] } };

export function planItem(providerId: string, item: PropSpecItem, row: PropRow | undefined): StatePlan[] {
  const base = basePhotos(row, item.states);
  return item.states.map((state, idx) => {
    const photos = photosFor(row, state);
    return photos.length ? { state, photos } : { state, draw: { idx, key: propStepKey(providerId, item, idx, base), base } };
  });
}

// Danh sách món khi ước tính: nối Biên kịch mà chưa biết kết quả thì undefined (src/core/estimate.ts ghi "chưa biết").
function knownSpec(p: PropsParams, connected: ReadonlySet<string>, known: EstimateKnown | undefined): { spec: PropSpecItem[]; fromWriter: boolean } | undefined {
  if (!connected.has("spec")) return { spec: specOf(p, undefined), fromWriter: false };
  const fromWriter = known ? pickInput(known.inputs, "spec", "propspec") : undefined;
  return fromWriter ? { spec: specOf(p, fromWriter), fromWriter: true } : undefined;
}

// Dòng thẻ khi có ảnh thật: số ảnh thật đã gắn trạng thái và số trạng thái sẽ vẽ.
function photoLine(p: PropsParams): string | undefined {
  const rows = Array.isArray(p.items) ? p.items : [];
  if (!rows.some((r) => Object.keys(r.photos ?? {}).length > 0)) return undefined;
  let real = 0;
  let draw = 0;
  let bare = 0;
  for (const r of rows) {
    if (rowStates(r).every((s) => photosFor(r, s).length === 0)) bare++;
    for (const s of rowStates(r)) {
      const n = photosFor(r, s).length;
      real += n;
      if (n === 0) draw++;
    }
  }
  const who = rows.length === 1 ? shorten(rows[0]!.name, 24) || "1 đồ vật" : `${rows.length} đồ vật`;
  // Node có ảnh thật thường là node Sản phẩm: món chưa có ảnh nào sẽ do dịch vụ tự vẽ hoàn toàn, nên nhắc rõ (spec mục 3.4).
  return [`${who} · ${real} ảnh thật · ${draw} ảnh vẽ`, bare ? `${bare} món chưa có ảnh thật` : ""].filter(Boolean).join(" · ");
}

export const definition = defineNode<PropsParams>({
  type: "props",
  label: "Đồ vật",
  description: "Ảnh mẫu từng đồ vật (rìu, khúc gỗ, lều…) và các trạng thái của nó (nguyên → bổ đôi), để mọi cảnh giữ đúng hình dạng. Tải ảnh thật vào trạng thái nào thì dùng ảnh đó.",
  inputs: [{ name: "spec", kind: "propspec", label: "Từ Biên kịch", optional: true }],
  outputs: [{ name: "props", kind: "props", label: "Đồ vật" }],
  library: "props",
  // Chỉ prompt cũ: thêm prompt sản phẩm vào đây là mọi node Đồ vật cũ hiện "chưa chạy" dù không tốn lượt. Node có ảnh thật
  // đã khác khoá nhờ tham số photos; ảnh vẽ từ ảnh thật khoá theo mã ảnh (propStepKey).
  cacheVersion: codeVersion(propStillPrompt, propStatePrompt),
  params,
  defaults: { name: "", items: [], provider: "fake" },
  cardLine: (p, out) => {
    const photos = photoLine(p);
    if (photos) return photos;
    const made = out?.props;
    const count = Array.isArray(p.items) ? p.items.length : 0;
    if (made?.kind === "props") return `${made.items.length} đồ vật · ${made.items.reduce((n, i) => n + i.images.length, 0)} ảnh`;
    return count > 0 ? `${count} đồ vật` : "chưa có đồ vật";
  },
  // 1 ảnh mỗi trạng thái chưa có ảnh thật, trừ ảnh đã có trong cache bước con. Nối Biên kịch mà chưa biết danh sách: không ước được.
  estimate(p, connected, known) {
    const k = knownSpec(p, connected, known);
    if (!k) return undefined;
    const image = k.spec.reduce(
      (n, item) => n + planItem(p.provider, item, rowOf(p, item, k.fromWriter)).filter((s) => "draw" in s && known?.step(s.draw.key) === undefined).length,
      0,
    );
    return { image, video: 0, text: 0 };
  },
  predict(p, connected, known) {
    const k = knownSpec(p, connected, known);
    if (!k) return undefined;
    const items: PropItem[] = [];
    for (const item of k.spec) {
      const images: PropItem["images"] = [];
      for (const s of planItem(p.provider, item, rowOf(p, item, k.fromWriter))) {
        if ("photos" in s) {
          images.push(...s.photos.map((mediaId) => ({ mediaId, state: s.state })));
          continue;
        }
        const mediaId = mediaIdOf(known.step(s.draw.key));
        if (mediaId === undefined) return undefined;
        images.push({ mediaId, state: s.state });
      }
      items.push({ name: item.name, description: item.description, images });
    }
    return { props: { kind: "props", items } };
  },
});
