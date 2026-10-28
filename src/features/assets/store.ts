import { desc, eq } from "drizzle-orm";
import type { Db } from "../../core/db/client";
import { assets } from "../../core/db/schema";
import { collectMediaIds } from "../../core/media-ids";
import type { AssetSummary } from "../../shared/api";
import type { AssetKind } from "../../shared/node-definition";
import type { NodeOutputs } from "../../shared/ports";

// Nơi ghi duy nhất của bảng assets.

function nameOf(kind: AssetKind, params: Record<string, unknown>, outputs: NodeOutputs): string {
  const given = typeof params.name === "string" ? params.name.trim() : "";
  if (given) return given;
  if (kind === "props") {
    const set = outputs.props;
    if (set?.kind === "props") return set.items.map((i) => i.name).join(", ").slice(0, 60);
  }
  const d = typeof params.description === "string" ? params.description.trim() : "";
  return d.length > 60 ? `${d.slice(0, 57)}…` : d || "Không tên";
}

// Đồ vật có thể đến từ Biên kịch (không nằm trong tham số node) → lưu danh sách món lấy từ kết quả,
// chọn lại thì từng món trúng cache bước con (khoá theo mô tả món), không tốn lượt.
function storedParams(kind: AssetKind, params: Record<string, unknown>, outputs: NodeOutputs): Record<string, unknown> {
  const set = outputs.props;
  if (kind !== "props" || set?.kind !== "props") return params;
  return { ...params, items: set.items.map((i) => ({ name: i.name, description: i.description, states: i.images.map((x) => x.state).join(", ") })) };
}

export function recordAsset(db: Db, a: { cacheKey: string; kind: AssetKind; params: unknown; outputs: NodeOutputs }): void {
  const params = storedParams(a.kind, (a.params ?? {}) as Record<string, unknown>, a.outputs);
  const row = {
    cacheKey: a.cacheKey,
    kind: a.kind,
    name: nameOf(a.kind, params, a.outputs),
    paramsJson: JSON.stringify(params),
    outputJson: JSON.stringify(a.outputs),
    updatedAt: Date.now(),
  };
  db.insert(assets).values(row).onConflictDoUpdate({ target: assets.cacheKey, set: row }).run();
}

export function listAssets(db: Db, kind: AssetKind): AssetSummary[] {
  return db
    .select()
    .from(assets)
    .where(eq(assets.kind, kind))
    .orderBy(desc(assets.updatedAt))
    .all()
    .map((r) => ({
      id: r.cacheKey,
      kind: r.kind,
      name: r.name,
      params: JSON.parse(r.paramsJson) as Record<string, unknown>,
      thumbnailMediaId: collectMediaIds(JSON.parse(r.outputJson))[0] ?? null,
      updatedAt: r.updatedAt,
    }));
}
