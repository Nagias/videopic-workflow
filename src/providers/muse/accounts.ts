import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const PROFILE_NAME_RE = /^muse_vid_\d{2}$/;

export type AccountState = "ready" | "busy" | "needs_login" | "cooldown";

export type MuseAccount = { id: string; profileDir: string };

export function isProfileLoggedIn(profileDir: string): boolean {
  return existsSync(path.join(profileDir, "Default", "IndexedDB", "https_muse.ai_0.indexeddb.leveldb"));
}

export function listProfiles(profilesDir: string): MuseAccount[] {
  if (!existsSync(profilesDir)) return [];
  return readdirSync(profilesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && PROFILE_NAME_RE.test(d.name))
    .map((d) => ({ id: d.name, profileDir: path.join(profilesDir, d.name) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export type AccountPool = {
  acquire(): MuseAccount;
  tryAcquire(): MuseAccount | null;
  acquireWait(signal: AbortSignal, onWait?: () => void): Promise<MuseAccount>;
  loggedInCount(): number;
  release(id: string, outcome: "ok" | "needs_login" | "cooldown"): void;
  snapshot(): { id: string; state: AccountState; loggedIn: boolean }[];
};

export const NEEDS_LOGIN_RECHECK_MS = 10 * 60_000;

export function createAccountPool(profilesDir: string, cooldownMs = 60_000, now: () => number = Date.now): AccountPool {
  const busy = new Set<string>();
  const needsLoginUntil = new Map<string, number>();
  const cooldownUntil = new Map<string, number>();
  let cursor = 0;

  const stateOf = (acc: MuseAccount): AccountState => {
    if (busy.has(acc.id)) return "busy";
    if ((needsLoginUntil.get(acc.id) ?? 0) > now() || !isProfileLoggedIn(acc.profileDir)) return "needs_login";
    if ((cooldownUntil.get(acc.id) ?? 0) > now()) return "cooldown";
    return "ready";
  };

  const tryAcquire = (): MuseAccount | null => {
      const all = listProfiles(profilesDir);
      if (all.length === 0 || all.every((a) => stateOf(a) === "needs_login")) {
        throw new Error(
          `Chưa có tài khoản Muse nào đã đăng nhập trong ${profilesDir}. Chạy "npm run muse:login -- muse_vid_01", đăng nhập rồi đóng cửa sổ.`,
        );
      }
      for (let i = 0; i < all.length; i++) {
        const acc = all[(cursor + i) % all.length]!;
        if (stateOf(acc) === "ready") {
          cursor = (cursor + i + 1) % all.length;
          busy.add(acc.id);
          return acc;
        }
      }
      return null;
  };

  return {
    tryAcquire,
    acquire() {
      const acc = tryAcquire();
      if (!acc) throw new Error("Mọi tài khoản Muse đang bận hoặc đang nghỉ sau lỗi. Thử lại sau ít phút.");
      return acc;
    },
    async acquireWait(signal, onWait) {
      for (;;) {
        const acc = tryAcquire();
        if (acc) return acc;
        if (signal.aborted) throw new Error("Đã dừng");
        onWait?.();
        await new Promise((r) => setTimeout(r, 2000));
      }
    },
    loggedInCount: () => listProfiles(profilesDir).filter((a) => isProfileLoggedIn(a.profileDir)).length,
    release(id, outcome) {
      busy.delete(id);
      if (outcome === "needs_login") needsLoginUntil.set(id, now() + NEEDS_LOGIN_RECHECK_MS);
      if (outcome === "cooldown") cooldownUntil.set(id, now() + cooldownMs);
      if (outcome === "ok") {
        needsLoginUntil.delete(id);
        cooldownUntil.delete(id);
      }
    },
    snapshot() {
      return listProfiles(profilesDir).map((a) => ({ id: a.id, state: stateOf(a), loggedIn: isProfileLoggedIn(a.profileDir) }));
    },
  };
}
