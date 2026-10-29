import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api-client";

afterEach(() => vi.unstubAllGlobals());

// fetch giả không bao giờ trả lời, chỉ nghe tín hiệu huỷ như fetch thật.
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    });
  });
}

describe("api.estimate — hạn chờ", () => {
  it("máy chủ không trả lời trong hạn thì báo tiếng Việt rõ ràng (không treo mãi, không nuốt lỗi)", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.estimate("wf", undefined, 30)).rejects.toThrow("Ước tính quá lâu, thử lại");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("trả lời kịp thì bình thường; lỗi của máy chủ vẫn là lời báo của máy chủ, không bị đổi thành 'quá lâu'", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "Đồ thị không dùng được" }), { status: 400 }))));
    await expect(api.estimate("wf", undefined, 1000)).rejects.toThrow("Đồ thị không dùng được");
  });
});
