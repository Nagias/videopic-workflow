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

describe("đọc dữ liệu lúc máy chủ đang khởi động (502)", () => {
  afterEach(() => vi.useRealTimers());
  const ok = () => new Response(JSON.stringify({ workflows: [] }), { status: 200 });
  const bad = (status: number) => new Response("", { status });

  it("502 vài lần rồi trả lời được → tự thử lại, ra kết quả, không báo lỗi", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(bad(502)).mockResolvedValueOnce(bad(503)).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);
    const pending = api.listWorkflows();
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ workflows: [] });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("máy chủ không lên sau khoảng 40 giây → báo tiếng Việt rõ ràng, chỉ cách kiểm tra", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(bad(502)));
    vi.stubGlobal("fetch", fetchMock);
    const start = Date.now();
    const pending = api.listWorkflows().catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = (await pending) as Error;
    expect(err.message).toBe("Máy chủ của app chưa trả lời (lỗi 502). Nếu cửa sổ VideoPic Workflow đã đóng thì bấm đúp Khoi-dong-VideoPic.cmd để bật lại");
    // Đồng hồ giả: đo đúng thời gian đã chờ (đồng hồ giả bắt đầu từ giờ thật, nên phải trừ mốc đầu).
    expect(Date.now() - start).toBeGreaterThanOrEqual(35_000);
    expect(Date.now() - start).toBeLessThan(45_000);
    expect(fetchMock).toHaveBeenCalledTimes(16);
  });

  it("lệnh ghi (POST/PUT) gặp 502 không tự gửi lại (tránh làm một việc hai lần)", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(bad(502)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.cancelRun("r1")).rejects.toThrow("lỗi 502");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lỗi thật của máy chủ (400, 404) khi đọc không thử lại", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "Không tìm thấy workflow" }), { status: 404 })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.getWorkflow("x")).rejects.toThrow("Không tìm thấy workflow");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
