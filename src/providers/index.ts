import type { AppConfig } from "../core/config";
import type { ProviderId } from "../shared/providers";
import { createFakeProvider } from "./fake";
import { createMuseProvider } from "./muse";
import type { AccountPool } from "./muse/accounts";
import type { ProviderRegistry, VideoProvider } from "./types";

export function createProviders(cfg: AppConfig, musePool: AccountPool): ProviderRegistry {
  const factories: Record<ProviderId, () => VideoProvider> = {
    fake: createFakeProvider,
    muse: () => createMuseProvider(cfg, musePool),
  };
  const cache = new Map<ProviderId, VideoProvider>();
  return {
    get(id) {
      let p = cache.get(id);
      if (!p) {
        const make = factories[id];
        if (!make) throw new Error(`Dịch vụ "${String(id)}" chưa được cài trong src/providers/index.ts`);
        p = make();
        cache.set(id, p);
      }
      return p;
    },
  };
}
