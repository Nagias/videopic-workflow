import { expect, type APIRequestContext, type Page } from "@playwright/test";

type Graph = { nodes: { id: string; params: Record<string, unknown> }[] };

// Đổi workflow mẫu Sinh tồn Sơn La (đã mở từ mẫu) sang dịch vụ giả để chạy được mà không tốn Muse, và làm cho kết quả của lần chạy này
// KHÁC mọi spec khác: cache node dùng chung cả lần chạy Playwright (cùng DATA_DIR, khoá chỉ theo loại + tham số + khoá nguồn, không theo
// workflow), nên mẫu giống hệt đã chạy ở spec trước thì node hiện "Dùng lại kết quả" thay vì "Xong". Mọi Cảnh nối với character-1 nên thêm một
// dấu riêng vào mô tả nhân vật làm khoá của cả 12 cảnh và Ghép phim đổi theo. Gọi xong thì tải lại trang (page.reload()).
export async function useFakeSonLa(target: Page | APIRequestContext, workflowId: string): Promise<void> {
  const request = "request" in target ? target.request : target;
  const url = `/api/workflows/${workflowId}`;
  const loaded = (await (await request.get(url)).json()) as { graph: Graph };
  // Không có character-1 thì không có chỗ đặt dấu riêng: các cảnh sẽ dùng lại kết quả của spec khác mà không báo gì. Dừng ngay.
  if (!loaded.graph.nodes.some((n) => n.id === "character-1")) {
    throw new Error(`useFakeSonLa: workflow ${workflowId} không có node character-1 (mẫu Sơn La đổi mã node?), không đặt được dấu riêng cho lần chạy`);
  }
  const salt = Math.random().toString(36).slice(2, 8);
  const nodes = loaded.graph.nodes.map((n) => {
    const params = "provider" in n.params ? { ...n.params, provider: "fake" } : n.params;
    if (n.id !== "character-1") return { ...n, params };
    return { ...n, params: { ...params, description: `${typeof params.description === "string" ? params.description : ""} (bản thử ${salt})` } };
  });
  expect((await request.put(url, { data: { graph: { ...loaded.graph, nodes } } })).ok()).toBe(true);
}

// Bấm "▶ Chạy" ở thanh trên rồi xác nhận ở hộp: Chạy cả workflow luôn hỏi trước khi chạy (xác nhận sau khi hộp hiện; nút "▶ Chạy"
// của hộp chỉ bấm được sau một nhịp ngắn, Playwright tự đợi).
export async function runAllConfirmed(page: Page): Promise<void> {
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("run-confirm")).toBeVisible();
  await page.getByTestId("run-confirm-ok").click();
}
