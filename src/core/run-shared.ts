import { ProviderError, type ChatSessionRef, type ProviderRegistry } from "../providers/types";
import type { ProviderId } from "../shared/providers";
import { SERVICE_FAILURE_CODES } from "../shared/service-failure";
import { semaphore } from "./semaphore";

export class ServiceBreakerOpen extends Error {
  constructor(limit: number) {
    super(`Dừng: dịch vụ báo lỗi máy chủ ${limit} lần — không gửi thêm để tránh tốn lượt. Bấm Chạy lại khi dịch vụ ổn (cảnh đã xong được giữ).`);
    this.name = "ServiceBreakerOpen";
  }
}

// Khoá theo chat (đường dẫn chat): cùng khoá thì lần lượt, khác khoá thì song song. Một bộ cho cả máy chủ.
export type ChatLocks = { with<T>(key: string, fn: () => Promise<T>): Promise<T> };

export function createChatLocks(): ChatLocks {
  const tails = new Map<string, Promise<void>>();
  return {
    async with<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const prev = tails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const mine = new Promise<void>((r) => (release = r));
      const tail = prev.then(() => mine);
      tails.set(key, tail);
      await prev;
      try {
        return await fn();
      } finally {
        release();
        if (tails.get(key) === tail) tails.delete(key);
      }
    },
  };
}

export type ServiceBreaker = { check(): void; record(err: unknown): void };

// Đồ dùng chung giữa các node trong một lần chạy.
export type RunShared = {
  slot<T>(providerId: ProviderId, fn: () => Promise<T>): Promise<T>;
  chat: ChatLocks;
  session(ref: ChatSessionRef): ChatSessionRef;
  updateSession(original: ChatSessionRef, next: ChatSessionRef): void;
  breaker: ServiceBreaker;
};

export function createRunShared(opts: { providers: ProviderRegistry; chatLocks: ChatLocks; failureLimit: number }): RunShared {
  const slots = new Map<ProviderId, ReturnType<typeof semaphore>>();
  const slotOf = (id: ProviderId) => {
    let sem = slots.get(id);
    if (!sem) {
      sem = semaphore(Math.max(1, opts.providers.get(id).maxParallel()));
      slots.set(id, sem);
    }
    return sem;
  };
  // Chat mới nhất của mỗi nhân vật, theo đường dẫn chat gốc.
  const sessions = new Map<string, ChatSessionRef>();
  let failures = 0;

  return {
    async slot<T>(providerId: ProviderId, fn: () => Promise<T>): Promise<T> {
      const sem = slotOf(providerId);
      await sem.acquire();
      try {
        return await fn();
      } finally {
        sem.release();
      }
    },
    chat: opts.chatLocks,
    session: (ref) => sessions.get(ref.threadUrl) ?? ref,
    updateSession: (original, next) => {
      sessions.set(original.threadUrl, next);
    },
    breaker: {
      check() {
        if (failures >= opts.failureLimit) throw new ServiceBreakerOpen(opts.failureLimit);
      },
      record(err) {
        if (err instanceof ProviderError && SERVICE_FAILURE_CODES.has(err.code)) failures++;
      },
    },
  };
}
