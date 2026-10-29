import { expect, test, type Page } from "@playwright/test";
import { runAllConfirmed } from "./helpers";

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const at = (x: number, y: number) => ({ x, y });

type SavedGraph = { graph: { nodes: { id: string; params: Record<string, unknown> }[] } };
const savedOrder = async (page: Page, wfId: string, combineId: string) => {
  const graph = ((await (await page.request.get(`/api/workflows/${wfId}`)).json()) as SavedGraph).graph;
  return graph.nodes.find((n) => n.id === combineId)!.params.order;
};

// Mã node nguồn của các clip trong dải thứ tự, từ trái sang phải.
const stripOrder = (page: Page, combineId: string) =>
  page
    .getByTestId(`order-strip-${combineId}`)
    .locator(`[data-testid^="order-item-${combineId}-"]`)
    .evaluateAll((els, prefix) => els.map((e) => e.getAttribute("data-testid")!.slice(prefix.length)), `order-item-${combineId}-`);

// Mẫu Ý tưởng → phim chạy bằng dịch vụ giả, ý tưởng riêng của lần này (không dùng lại cache của spec khác), `count` cảnh.
async function openFakeIdeaTemplate(page: Page, count: number): Promise<void> {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto("/");
  await page.getByTestId("template-y-tuong-thanh-phim").click();
  await expect(page).toHaveURL(/wf=y-tuong-thanh-phim-/);
  for (const id of ["character-1", "location-1", "writer-1", "props-1"]) {
    await page.getByTestId(`card-${id}`).click();
    await page.getByTestId(`provider-select-${id}`).selectOption("fake");
  }
  await page.getByTestId("card-writer-1").click();
  await page.getByTestId("writer-idea-writer-1").fill(`Cô gái đi dọc bờ suối rồi dựng lều bên đá (thứ tự clip ${uid()}).`);
  await page.getByTestId("writer-count-writer-1").fill(String(count));
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
}

test("kéo clip 12 lên đầu → params.order đổi, ước tính ghi Ghép phim sẽ chạy lại (0 lượt Muse); đổi tiếp ý tưởng Biên kịch rồi chạy → ra decision scenes-edited (thứ tự sửa tay được tính là sửa nhóm), 0 video", async ({ page }) => {
  test.setTimeout(600_000);
  await openFakeIdeaTemplate(page, 12);
  await runAllConfirmed(page);
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 300_000 });
  await expect(page.getByTestId("node-status-scene-g1-12")).toHaveText("Xong");

  // Chọn Ghép phim: dải thứ tự có 12 clip theo thứ tự cảnh, mỗi clip là khung đầu của cảnh đã chạy.
  await page.getByTestId("card-combine-g1").click();
  const inOrder = Array.from({ length: 12 }, (_, i) => `scene-g1-${i + 1}`);
  await expect.poll(() => stripOrder(page, "combine-g1")).toEqual(inOrder);
  await expect(page.getByTestId("order-item-combine-g1-scene-g1-12").locator("img")).toHaveCount(1);
  await expect(page.getByTestId("order-item-combine-g1-scene-g1-12")).toContainText("Cảnh 12");

  // Kéo clip 12 lên đầu: dải đổi, lưu, và params.order của Ghép phim đúng thứ tự mới.
  await page.getByTestId("order-item-combine-g1-scene-g1-12").dragTo(page.getByTestId("order-item-combine-g1-scene-g1-1"));
  const moved = ["scene-g1-12", ...inOrder.slice(0, 11)];
  await expect.poll(() => stripOrder(page, "combine-g1")).toEqual(moved);
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect.poll(() => savedOrder(page, new URL(page.url()).searchParams.get("wf")!, "combine-g1")).toEqual(moved);

  // Ước tính: chỉ Ghép phim chạy lại (không gọi dịch vụ), các cảnh dùng lại, tổng 0 lượt Muse.
  await expect(page.getByTestId("estimate-pill")).not.toContainText("dùng lại hết", { timeout: 15_000 });
  await expect(page.getByTestId("estimate-pill")).toContainText("0 lượt Muse");
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("run-confirm")).toBeVisible();
  await expect(page.getByTestId("run-confirm-row-combine-g1")).toContainText("Ghép phim");
  await expect(page.getByTestId("run-confirm-row-combine-g1")).toContainText("chạy, không gọi dịch vụ");
  await expect(page.getByTestId("run-confirm-row-scene-g1-5")).toContainText("dùng lại");
  await expect(page.getByTestId("run-confirm-total")).toContainText("0 lượt Muse");
  await page.getByTestId("run-confirm-cancel").click();
  await expect(page.getByTestId("run-confirm")).toHaveCount(0);

  // Đổi ý tưởng Biên kịch rồi chạy: thứ tự sửa tay làm nhóm thành "đã sửa tay" nên lần chạy dừng hỏi Thay/Giữ, không tạo video nào.
  await page.getByTestId("card-writer-1").click();
  await page.getByTestId("writer-idea-writer-1").fill(`Cô gái leo đồi ngắm mây rồi nhóm bếp (thứ tự clip ${uid()}).`);
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await runAllConfirmed(page);
  await expect(page.getByTestId("scenes-decision")).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId("run-status")).toHaveText("Lỗi");
  const wfId = new URL(page.url()).searchParams.get("wf")!;
  const latest = (await (await page.request.get(`/api/workflows/${wfId}/runs/latest`)).json()) as {
    run: { decision: { kind: string } | null; nodes: Record<string, { status: string }> };
  };
  expect(latest.run.decision?.kind).toBe("scenes-edited");
  const made = Object.entries(latest.run.nodes).filter(([id, n]) => (id.startsWith("scene-g1-") || id === "combine-g1") && (n.status === "succeeded" || n.status === "running"));
  expect(made).toEqual([]);
});

test("Alt+mũi tên đổi chỗ clip bằng bàn phím, tiêu điểm đi theo clip, đứng yên ở đầu dải; clip chưa chạy hiện ô 'clip'", async ({ page }) => {
  const wfId = `thu-tu-clip-${uid()}`;
  const video = (id: string, x: number) => ({ id, type: "generate-video", position: at(x, 0), params: { provider: "fake", durationSec: 5 } });
  const wire = (id: string) => ({ id: `e-${id}`, source: id, sourceHandle: "video", target: "c", targetHandle: "clips" });
  const graph = {
    nodes: [video("v1", 0), video("v2", 400), video("v3", 800), { id: "c", type: "film-combine", position: at(1200, 0), params: { fixBrightness: true } }],
    edges: [wire("v1"), wire("v2"), wire("v3")],
  };
  expect((await page.request.put(`/api/workflows/${wfId}`, { data: { graph } })).ok()).toBe(true);
  await page.goto(`/?wf=${wfId}`);
  await page.getByTestId("card-c").click();
  // Chưa ai kéo: thứ tự theo toạ độ, chưa có params.order, mỗi clip là ô "clip" (chưa chạy nên chưa có khung đầu).
  await expect.poll(() => stripOrder(page, "c")).toEqual(["v1", "v2", "v3"]);
  await expect(page.getByTestId("order-item-c-v1").locator(".order-clip")).toHaveText("clip");
  expect(await savedOrder(page, wfId, "c")).toBeUndefined();

  const third = page.getByTestId("order-item-c-v3");
  await third.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => stripOrder(page, "c")).toEqual(["v1", "v3", "v2"]);
  await expect(third).toBeFocused();
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect.poll(() => savedOrder(page, wfId, "c")).toEqual(["v1", "v3", "v2"]);

  await page.keyboard.press("Alt+ArrowLeft");
  await expect.poll(() => stripOrder(page, "c")).toEqual(["v3", "v1", "v2"]);
  await expect(third).toBeFocused();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => stripOrder(page, "c")).toEqual(["v3", "v1", "v2"]);
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => stripOrder(page, "c")).toEqual(["v1", "v3", "v2"]);
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect.poll(() => savedOrder(page, wfId, "c")).toEqual(["v1", "v3", "v2"]);

  // Mở lại: dải đọc thứ tự đã lưu.
  await page.reload();
  await page.getByTestId("card-c").click();
  await expect.poll(() => stripOrder(page, "c")).toEqual(["v1", "v3", "v2"]);
});

test("Tạo thẻ cảnh lại với Biên kịch đổi số cảnh → thẻ mới hiện Chưa chạy", async ({ page }) => {
  test.setTimeout(600_000);
  await openFakeIdeaTemplate(page, 8);
  await runAllConfirmed(page);
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 300_000 });
  await expect(page.getByTestId("node-status-scene-g1-3")).toHaveText("Xong");
  await expect(page.getByTestId("node-status-scene-g1-8")).toHaveText("Xong");

  // Sửa tay một thẻ (nhóm thành "đã sửa tay") rồi đổi ý tưởng và số cảnh: lần chạy dừng hỏi, chọn Giữ.
  await page.getByTestId("card-scene-g1-3").click();
  await page.getByTestId("scene-motion-scene-g1-3").fill("cô đứng yên bên suối, gió thổi nhẹ tóc (sửa tay)");
  await page.getByTestId("card-writer-1").click();
  await page.getByTestId("writer-idea-writer-1").fill(`Cô gái leo lên đỉnh đồi ngắm mây rồi dựng lều (nhóm cảnh ${uid()}).`);
  await page.getByTestId("writer-count-writer-1").fill("10");
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await runAllConfirmed(page);
  await expect(page.getByTestId("scenes-decision")).toBeVisible({ timeout: 180_000 });
  await page.getByTestId("scenes-keep").click();
  await expect(page.getByTestId("scenes-decision")).toHaveCount(0);
  // Giữ: các thẻ giữ nguyên tham số nên trạng thái đang hiện (lần chạy dừng hỏi đã đánh dấu "Bỏ qua") không bị đụng tới.
  await expect(page.getByTestId("node-status-scene-g1-8")).toHaveText("Bỏ qua");
  await expect(page.getByTestId("node-scene-g1-10")).toHaveCount(0);

  // Tạo thẻ cảnh: bộ 10 cảnh mới của Biên kịch thay nhóm. Thẻ 3 bị thay bằng chữ của Biên kịch, thẻ 9 và 10 là thẻ mới: đều chưa chạy.
  await page.getByTestId("card-writer-1").click();
  // Lần đầu: máy chủ không trả được kết quả (mạng hỏng) ngay sau khi đổi thẻ → thẻ bị thay vẫn không được hiện clip cũ, và có báo lỗi.
  await page.route("**/runs/latest", (route) => route.abort());
  await page.getByTestId("writer-expand-writer-1").click();
  await expect(page.getByTestId("node-scene-g1-10")).toBeVisible();
  await expect(page.getByTestId("problem-banner")).toContainText("Không tải được kết quả");
  await expect(page.getByTestId("node-status-scene-g1-3")).toHaveText("Chưa chạy");
  await expect(page.getByTestId("node-status-combine-g1")).toHaveText("Chưa chạy");
  await page.unroute("**/runs/latest");
  await expect(page.getByTestId("node-status-scene-g1-10")).toHaveText("Chưa chạy");
  await expect(page.getByTestId("node-status-scene-g1-9")).toHaveText("Chưa chạy");
  await expect(page.getByTestId("node-status-scene-g1-3")).toHaveText("Chưa chạy");

  await expect(page.getByTestId("node-status-combine-g1")).toHaveText("Chưa chạy");

  // Chạy riêng một node không liên quan (Nhân vật): sau lần chạy một phần, các thẻ bị thay và Ghép phim vẫn "Chưa chạy"
  // (máy chủ không trả lại clip cũ của cùng mã node), và tab Kết quả nói rõ lý do.
  await page.getByTestId("card-character-1").click();
  await page.keyboard.press("Shift+Enter");
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 120_000 });
  await expect(page.getByTestId("node-status-character-1")).toHaveText(/Xong|Dùng lại kết quả/);
  for (const id of ["scene-g1-3", "scene-g1-9", "scene-g1-10", "combine-g1"]) await expect(page.getByTestId(`node-status-${id}`)).toHaveText("Chưa chạy");
  await page.getByTestId("card-scene-g1-3").click();
  await page.getByTestId("inspector-tab-result").click();
  await expect(page.getByTestId("result-outdated-scene-g1-3")).toContainText("đã đổi sau lần chạy cuối");
  await expect(page.getByTestId("result-media-scene-g1-3")).toHaveCount(0);

  // Tải lại trang: vẫn "Chưa chạy", nhân vật vẫn giữ kết quả.
  await page.reload();
  await expect(page.getByTestId("node-scene-g1-10")).toBeVisible();
  await expect(page.getByTestId("node-status-character-1")).toHaveText(/Xong|Dùng lại kết quả/);
  for (const id of ["scene-g1-3", "scene-g1-9", "scene-g1-10", "combine-g1"]) await expect(page.getByTestId(`node-status-${id}`)).toHaveText("Chưa chạy");

  // Chạy lại thì có kết quả mới.
  await runAllConfirmed(page);
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 300_000 });
  await expect(page.getByTestId("node-status-scene-g1-10")).toHaveText("Xong");
  await expect(page.getByTestId("node-status-scene-g1-3")).toHaveText("Xong");
  await expect(page.getByTestId("node-status-combine-g1")).toHaveText("Xong");

  // Chạy lại riêng một cảnh (bản mới): cảnh có clip mới, nhưng phim ghép vẫn làm từ clip cũ → Ghép phim "Chưa chạy" (ước tính cũng ghi chạy lại).
  await page.getByTestId("card-scene-g1-4").click({ button: "right" });
  await page.getByTestId("ctx-rerun").click();
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 120_000 });
  await expect(page.getByTestId("node-status-scene-g1-4")).toHaveText("Xong");
  await expect(page.getByTestId("node-status-scene-g1-5")).toHaveText(/Xong|Dùng lại kết quả/);
  await expect(page.getByTestId("node-status-combine-g1")).toHaveText("Chưa chạy");

  // Sửa tay chữ của một cảnh ở khung bên phải: lưu xong thì thẻ hiện "Chưa chạy" ngay, không cần tải lại trang.
  await expect(page.getByTestId("node-status-scene-g1-6")).toHaveText(/Xong|Dùng lại kết quả/);
  await page.getByTestId("card-scene-g1-6").click();
  await page.getByTestId("scene-motion-scene-g1-6").fill("cô ngồi xuống nghỉ bên đá (sửa sau khi chạy)");
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect(page.getByTestId("node-status-scene-g1-6")).toHaveText("Chưa chạy");
  await expect(page.getByTestId("node-status-scene-g1-7")).toHaveText(/Xong|Dùng lại kết quả/);
});
