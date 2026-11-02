import { afterEach, describe, expect, it, vi } from "vitest";
import { api, SaveTimeoutError, WorkflowConflictError } from "./api-client";

afterEach(() => vi.unstubAllGlobals());

// fetch giả không bao giờ trả lời, chỉ nghe tín hiệu huỷ như fetch thật.
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    });
  });
}

describe("api.saveWorkflow — hạn chờ", () => {
  const body = { graph: { nodes: [], edges: [] } };

  it("máy chủ không trả lời trong hạn: huỷ yêu cầu (tín hiệu abort tới fetch), ném SaveTimeoutError tiếng Việt", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const err = await api.saveWorkflow("wf", body, 30).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SaveTimeoutError);
    expect((err as Error).message).toBe("Lưu quá lâu (máy chủ không trả lời sau 20 giây), thử lại");
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
  });

  it("409 trong hạn vẫn là WorkflowConflictError kèm bản máy chủ, không bị đổi thành 'quá lâu'", async () => {
    const workflow = { id: "wf", name: "Thử", graph: { nodes: [], edges: [], groups: [] }, updatedAt: 5 };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "Workflow vừa được cập nhật ở nơi khác", workflow }), { status: 409 }))));
    const err = await api.saveWorkflow("wf", body, 1000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WorkflowConflictError);
    expect((err as WorkflowConflictError).workflow.updatedAt).toBe(5);
  });
});

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
