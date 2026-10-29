import { expect, type APIRequestContext, type Page } from "@playwright/test";

type Graph = { nodes: { id: string; params: Record<string, unknown> }[] };

// Đồ thị đang lưu của một workflow, đúng phần các spec đọc.
export type SavedGraph = {
  nodes: { id: string; type: string; position: { x: number; y: number }; params: Record<string, unknown> }[];
  edges: { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }[];
  groups: { id: string; label: string; nodeIds: string[]; manual?: boolean; source?: unknown }[];
};

// Ghi thẳng đồ thị của workflow `id` qua API (chưa có thì tạo).
export async function putWorkflow(page: Page, id: string, graph: unknown): Promise<void> {
  expect((await page.request.put(`/api/workflows/${id}`, { data: { graph } })).ok()).toBe(true);
}

export const readGraph = async (page: Page, id: string): Promise<SavedGraph> =>
  ((await (await page.request.get(`/api/workflows/${id}`)).json()) as { graph: SavedGraph }).graph;

export type LatestRun = { run: { id: string; status: string } | null; nodes: Record<string, { status: string; output: unknown }> };
export const latestRun = async (page: Page, wfId: string): Promise<LatestRun> =>
  (await (await page.request.get(`/api/workflows/${wfId}/runs/latest`)).json()) as LatestRun;
export const latestRunId = async (page: Page, wfId: string): Promise<string | null> => (await latestRun(page, wfId)).run?.id ?? null;

// Khung nhìn của canvas dạng chữ (transform của .react-flow__viewport): so trước/sau khi kéo, phóng, vừa màn hình.
export const viewportOf = (page: Page): Promise<string> => page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform);

// Bấm nút "vừa màn hình" của xyflow rồi đợi khung nhìn đứng yên (đo cổng, toạ độ thẻ, chỗ thả dây sau đó mới đúng): khung nhìn đổi
// thì đợi tới khi hai lần đọc liền nhau giống nhau; đã vừa sẵn (không đổi) thì đợi ít nhất 500 ms rồi coi là xong.
export async function fitView(page: Page): Promise<void> {
  const before = await viewportOf(page);
  const clicked = Date.now();
  await page.locator(".react-flow__controls-fitview").click();
  let last = before;
  await expect
    .poll(async () => {
      const now = await viewportOf(page);
      const still = now === last && (now !== before || Date.now() - clicked >= 500);
      last = now;
      return still;
    })
    .toBe(true);
}

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

// Điểm trống thật của nền canvas (ngoài thẻ, khung nhóm, nút điều khiển và minimap, tức là chỗ elementFromPoint trả về chính nền),
// tìm từ góc trên trái trở đi, thay cho toạ độ cố định có thể rơi vào nút điều khiển ở góc dưới phải.
export async function findEmptyPane(page: Page): Promise<{ x: number; y: number }> {
  const spot = await page.evaluate(() => {
    const canvas = document.querySelector(".canvas")!.getBoundingClientRect();
    for (let y = canvas.top + 40; y < canvas.bottom - 40; y += 40) {
      for (let x = canvas.left + 40; x < canvas.right - 40; x += 40) {
        if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
      }
    }
    return null;
  });
  if (!spot) throw new Error("findEmptyPane: không tìm được chỗ trống trên nền canvas");
  return spot;
}

// Bấm vào một chỗ trống của nền canvas.
export async function clickEmptyPane(page: Page): Promise<void> {
  const spot = await findEmptyPane(page);
  await page.mouse.click(spot.x, spot.y);
}
