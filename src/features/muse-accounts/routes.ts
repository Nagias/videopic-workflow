import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../core/app-deps";
import type { MuseAccountsResponse } from "../../shared/api";

export function registerMuseAccountRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get("/api/muse/accounts", () => {
    const res: MuseAccountsResponse = { accounts: deps.musePool.snapshot() };
    return res;
  });
}
