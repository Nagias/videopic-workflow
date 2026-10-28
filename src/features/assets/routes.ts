import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../core/app-deps";
import type { AssetListResponse } from "../../shared/api";
import { ASSET_KINDS, type AssetKind } from "../../shared/node-definition";
import { listAssets } from "./store";

export function registerAssetRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get<{ Querystring: { kind?: string } }>("/api/assets", async (req, reply) => {
    const kind = req.query.kind;
    if (!ASSET_KINDS.includes(kind as AssetKind)) return reply.code(400).send({ error: `Loại tài sản không hợp lệ (cần một trong: ${ASSET_KINDS.join(", ")})` });
    const res: AssetListResponse = { assets: listAssets(deps.db, kind as AssetKind) };
    return res;
  });
}
