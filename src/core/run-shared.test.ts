import { describe, expect, it } from "vitest";
import { ProviderError, type MediaProvider, type ProviderRegistry } from "../providers/types";
import { createChatLocks, createRunShared, ServiceBreakerOpen } from "./run-shared";

// Promise mở bằng tay: test tự quyết lúc nào một việc được làm xong.
function latch() {
  let open!: () => void;
  const done = new Promise<void>((r) => (open = r));
  return { done, open };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

function providersWith(maxParallel: number): ProviderRegistry {
  const provider = { id: "fake", maxParallel: () => maxParallel } as unknown as MediaProvider;
  return { get: () => provider };
}

describe("RunShared", () => {
  it("chat.with cùng khoá chạy lần lượt, khác khoá chạy song song", async () => {
    const chat = createChatLocks();
    const events: string[] = [];
    const a1 = latch();
    const a2 = latch();
    const b1 = latch();
    const job = (name: string, gate: { done: Promise<void> }) => async () => {
      events.push(`start ${name}`);
      await gate.done;
      events.push(`end ${name}`);
      return name;
    };
    const pA1 = chat.with("chat-a", job("a1", a1));
    const pA2 = chat.with("chat-a", job("a2", a2));
    const pB1 = chat.with("chat-b", job("b1", b1));
    await tick();
    // a1 và b1 cùng chạy (khác khoá); a2 phải chờ a1.
    expect(events).toEqual(["start a1", "start b1"]);

    a2.open();
    await tick();
    expect(events).not.toContain("start a2");

    a1.open();
    expect(await pA1).toBe("a1");
    expect(await pA2).toBe("a2");
    expect(events.indexOf("start a2")).toBeGreaterThan(events.indexOf("end a1"));
    expect(events).not.toContain("end b1");

    b1.open();
    expect(await pB1).toBe("b1");
  });

  it("chat.with: việc trước lỗi thì việc sau cùng khoá vẫn chạy", async () => {
    const chat = createChatLocks();
    const first = chat.with("k", () => Promise.reject(new Error("hỏng")));
    const second = chat.with("k", () => Promise.resolve("ok"));
    await expect(first).rejects.toThrow("hỏng");
    expect(await second).toBe("ok");
  });

  it("slot giới hạn theo maxParallel", async () => {
    const shared = createRunShared({ providers: providersWith(2), chatLocks: createChatLocks(), failureLimit: 3 });
    let active = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, () => latch());
    const jobs = gates.map((g, i) =>
      shared.slot("fake", async () => {
        active++;
        peak = Math.max(peak, active);
        await g.done;
        active--;
        return i;
      }),
    );
    await tick();
    expect(active).toBe(2);
    for (const g of gates) {
      g.open();
      await tick();
      expect(active).toBeLessThanOrEqual(2);
    }
    expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it("breaker đếm MUSE_FAILED/NO_MEDIA, lần thứ 3 thì check ném lỗi có chữ 'không gửi thêm để tránh tốn lượt'", () => {
    const shared = createRunShared({ providers: providersWith(1), chatLocks: createChatLocks(), failureLimit: 3 });
    shared.breaker.record(new ProviderError("MUSE_FAILED", "Muse lỗi"));
    shared.breaker.record(new ProviderError("REFUSED", "từ chối"));
    shared.breaker.record(new Error("lỗi thường"));
    shared.breaker.record(new ProviderError("NO_MEDIA", "không có video"));
    expect(() => shared.breaker.check()).not.toThrow();
    shared.breaker.record(new ProviderError("MUSE_FAILED", "Muse lỗi"));
    expect(() => shared.breaker.check()).toThrow(ServiceBreakerOpen);
    expect(() => shared.breaker.check()).toThrow(/không gửi thêm để tránh tốn lượt/);
    expect(() => shared.breaker.check()).toThrow("Dừng: dịch vụ báo lỗi máy chủ 3 lần — không gửi thêm để tránh tốn lượt. Bấm Chạy lại khi dịch vụ ổn (cảnh đã xong được giữ).");
  });

  it("session trả chat mới nhất của nhân vật theo chat gốc", () => {
    const shared = createRunShared({ providers: providersWith(1), chatLocks: createChatLocks(), failureLimit: 3 });
    const original = { accountId: "a", threadUrl: "t://1" };
    expect(shared.session(original)).toBe(original);
    const next = { accountId: "b", threadUrl: "t://2" };
    shared.updateSession(original, next);
    expect(shared.session(original)).toEqual(next);
    expect(shared.session({ accountId: "a", threadUrl: "t://1" })).toEqual(next);
    const latest = { accountId: "c", threadUrl: "t://3" };
    shared.updateSession(original, latest);
    expect(shared.session(original)).toEqual(latest);
    expect(shared.session({ accountId: "x", threadUrl: "t://khac" })).toEqual({ accountId: "x", threadUrl: "t://khac" });
  });
});
