import { expect, test, type Page } from "@playwright/test";
import { clickEmptyPane, runAllConfirmed, useFakeSonLa } from "./helpers";

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const at = (x: number, y: number) => ({ x, y });

type SavedNode = { id: string; params: Record<string, unknown> };
const readNodes = async (page: Page, id: string) => ((await (await page.request.get(`/api/workflows/${id}`)).json()) as { graph: { nodes: SavedNode[] } }).graph.nodes;
const latestRunId = async (page: Page, id: string) => ((await (await page.request.get(`/api/workflows/${id}/runs/latest`)).json()) as { run: { id: string } | null }).run?.id ?? null;

// Mọi yêu cầu xin chạy (POST .../runs) của trang này: đếm lại để biết có lần chạy nào được xin hay không.
function watchRunRequests(page: Page): { count: () => number } {
  let n = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/workflows\/[^/]+\/runs$/.test(new URL(r.url()).pathname)) n++;
  });
  return { count: () => n };
}

async function putWorkflow(page: Page, id: string, nodes: unknown[], edges: unknown[] = []) {
  expect((await page.request.put(`/api/workflows/${id}`, { data: { graph: { nodes, edges } } })).ok()).toBe(true);
}

// Prompt → Tạo video (dịch vụ giả), thêm một Prompt riêng lẻ q.
async function putFakeVideo(page: Page, id: string) {
  await putWorkflow(
    page,
    id,
    [
      { id: "p", type: "prompt", position: at(0, 0), params: { text: `Rừng sương sớm ${id}` } },
      { id: "v", type: "generate-video", position: at(420, 0), params: { provider: "fake", durationSec: 5 } },
      { id: "q", type: "prompt", position: at(0, 300), params: { text: "Một chiếc lều bên suối" } },
    ],
    [{ id: "e1", source: "p", sourceHandle: "text", target: "v", targetHandle: "prompt" }],
  );
}

// Nhân vật + Không gian (giả) → Cảnh dùng MUSE: chỉ để xem ước tính và hộp xác nhận. Không bao giờ bấm "▶ Chạy" ở workflow này.
async function putMuseScene(page: Page, id: string) {
  await putWorkflow(
    page,
    id,
    [
      { id: "c", type: "character", position: at(0, 0), params: { name: "Mai", description: "cô gái tóc đen buộc đuôi ngựa, áo khoác xám, dáng nhỏ nhắn", provider: "fake" } },
      { id: "l", type: "location", position: at(0, 400), params: { description: "bãi cỏ rộng bên suối đá, cây cối thưa, ánh nắng chiều xiên qua tán lá", provider: "fake" } },
      {
        id: "s",
        type: "scene",
        position: at(420, 100),
        params: { size: "MS", angle: "eye", move: "static", subject: "character", start: "cô gái đứng bên suối", motion: "cô đi về phía lều", props: "", provider: "muse" },
      },
    ],
    [
      { id: "e1", source: "c", sourceHandle: "character", target: "s", targetHandle: "character" },
      { id: "e2", source: "l", sourceHandle: "location", target: "s", targetHandle: "location" },
    ],
  );
}

test("bấm Chạy cả workflow → hộp xác nhận (tiêu điểm ở Huỷ) → Enter / Escape đều là Huỷ → không có lượt chạy nào", async ({ page }) => {
  const id = `uoc-tinh-${uid()}`;
  await putFakeVideo(page, id);
  const runs = watchRunRequests(page);
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("card-q")).toBeVisible();

  await page.getByTestId("run-button").click();
  const box = page.getByTestId("run-confirm");
  await expect(box).toBeVisible();
  // Mọi node trong phạm vi có một dòng; Tạo video giả ghi rõ không tốn lượt Muse.
  await expect(page.getByTestId("run-confirm-row-p")).toBeVisible();
  await expect(page.getByTestId("run-confirm-row-v")).toContainText("dịch vụ giả");
  await expect(page.getByTestId("run-confirm-total")).toContainText("0 lượt Muse (dịch vụ giả: 1 node)");
  await expect(page.getByTestId("run-confirm-total")).not.toContainText("dùng lại hết");
  // An toàn mặc định: tiêu điểm nằm ở Huỷ, nên Enter một mình là Huỷ chứ không chạy.
  await expect(page.getByTestId("run-confirm-cancel")).toBeFocused();
  // Ước tính chắc chắn (không node chưa biết): có câu "không thấp hơn thực tế".
  await expect(page.getByTestId("run-confirm-note")).toBeVisible();
  // Mọi thứ phía sau hộp bị khoá (inert): bấm chữ trong hộp rồi Tab liên tục, tiêu điểm không lọt ra ô nào của canvas, thanh trên, khung phải.
  await expect(page.locator(".editor")).toHaveAttribute("inert", "");
  await page.getByTestId("run-confirm-total").click();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="run-confirm"]') !== null)).toBe(true);
  }
  await page.getByTestId("run-confirm-cancel").focus();
  await page.keyboard.press("Enter");
  await expect(box).toHaveCount(0);
  expect(await latestRunId(page, id)).toBeNull();
  expect(runs.count()).toBe(0);

  await page.getByTestId("run-button").click();
  await expect(box).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);

  // Ctrl+Enter cũng qua hộp; bấm ra ngoài lớp phủ là Huỷ.
  await clickEmptyPane(page);
  await page.keyboard.press("Control+Enter");
  await expect(box).toBeVisible();
  await expect(page.getByTestId("run-confirm-ok")).toBeEnabled();
  await page.mouse.click(5, 5);
  await expect(box).toHaveCount(0);

  expect(await latestRunId(page, id)).toBeNull();
  expect(runs.count()).toBe(0);
  await expect(page.getByTestId("run-button")).toBeEnabled();
});

test("bấm Chạy hai lần liền → một hộp, và xác nhận → đúng một lần chạy", async ({ page }) => {
  test.setTimeout(120_000);
  const id = `uoc-tinh-${uid()}`;
  await putFakeVideo(page, id);
  const runs = watchRunRequests(page);
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("card-q")).toBeVisible();

  await page.getByTestId("run-button").dblclick();
  await expect(page.getByTestId("run-confirm")).toHaveCount(1);
  await page.getByTestId("run-confirm-ok").click();
  await expect(page.getByTestId("run-confirm")).toHaveCount(0);
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 60_000 });
  expect(runs.count()).toBe(1);
});

test("chạy node Prompt (0 lượt) không hỏi: chạy thẳng", async ({ page }) => {
  test.setTimeout(120_000);
  const id = `uoc-tinh-${uid()}`;
  await putFakeVideo(page, id);
  const runs = watchRunRequests(page);
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("card-q")).toBeVisible();

  await page.getByTestId("card-q").click({ button: "right" });
  await page.getByTestId("ctx-run-node").click();
  await expect.poll(() => latestRunId(page, id)).not.toBeNull();
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 60_000 });
  await expect(page.getByTestId("run-confirm")).toHaveCount(0);
  expect(runs.count()).toBe(1);
  // Rảnh sau lần chạy: dòng "lần chạy trước" nổi ở góc dưới trái, không cần chọn node.
  await expect(page.getByTestId("queue-last")).toContainText("Chạy xong");

  // Tạo video giả cũng không phải lượt Muse: không hỏi.
  await page.getByTestId("card-v").click({ button: "right" });
  await page.getByTestId("ctx-run-node").click();
  await expect.poll(() => runs.count()).toBe(2);
  await expect(page.getByTestId("run-confirm")).toHaveCount(0);
});

test("Chạy lại (bản mới) một Cảnh Muse → hộp ghi 'sẽ gọi Muse' → Huỷ → take về như cũ, không có lần chạy nào", async ({ page }) => {
  const id = `uoc-tinh-${uid()}`;
  await putMuseScene(page, id);
  // Chặn cứng mọi yêu cầu xin chạy: workflow này dùng Muse, test này không bao giờ được chạy nó.
  const blocked: string[] = [];
  await page.route("**/api/workflows/*/runs", (route) => {
    if (route.request().method() === "POST") {
      blocked.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("card-s")).toBeVisible();
  expect((await readNodes(page, id)).find((n) => n.id === "s")!.params.take).toBeUndefined();

  await page.getByTestId("card-s").click({ button: "right" });
  await page.getByTestId("ctx-rerun").click();
  await expect(page.getByTestId("run-confirm")).toBeVisible();
  // Ước tính tính trên bản đã tăng take: Cảnh thiếu cache nên sẽ gọi Muse.
  await expect(page.getByTestId("run-confirm-row-s")).toContainText("sẽ gọi Muse");
  await expect(page.getByTestId("run-confirm-row-s")).toContainText("video");
  await expect(page.getByTestId("run-confirm-total")).toContainText("video Muse");
  // Hộp đang mở: bản đã lưu mang take 2 (ước tính chỉ đọc bản đã lưu).
  expect((await readNodes(page, id)).find((n) => n.id === "s")!.params.take).toBe(2);

  await page.getByTestId("run-confirm-cancel").click();
  await expect(page.getByTestId("run-confirm")).toHaveCount(0);
  await expect.poll(async () => (await readNodes(page, id)).find((n) => n.id === "s")!.params.take).toBeUndefined();
  expect(await latestRunId(page, id)).toBeNull();
  expect(blocked).toEqual([]);
  await expect(page.getByTestId("run-button")).toBeEnabled();
});

test("ước tính lỗi thì báo lỗi và không chạy; ô 'Lần chạy tới' đổi theo bản đã lưu", async ({ page }) => {
  const id = `uoc-tinh-${uid()}`;
  await putMuseScene(page, id);
  const runs = watchRunRequests(page);
  await page.route("**/api/workflows/*/runs", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("card-s")).toBeVisible();

  // Cảnh Muse chưa chạy lần nào: ô ghi số lượt Muse; đổi sang dịch vụ giả → sau lần lưu + 1 giây ô về 0 lượt.
  const pill = page.getByTestId("estimate-pill");
  await expect(pill).toContainText(/video Muse/);
  await page.getByTestId("card-s").click();
  await page.getByTestId("scene-provider-s").selectOption("fake");
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  // Nhân vật và Không gian có thể đã có kết quả dùng chung từ spec khác (cache), nên số node giả không cố định.
  await expect(pill).toContainText(/0 lượt Muse \(dịch vụ giả: \d+ node\)/);
  await expect(pill).not.toContainText("dùng lại hết");

  // Ước tính hỏng: lời báo của máy chủ hiện ra, hộp không mở, không xin chạy.
  await page.route("**/api/workflows/*/estimate", (route) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Không ước tính được: thử nghiệm" }) }));
  await page.keyboard.press("Escape");
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("problem-banner")).toContainText("Không ước tính được: thử nghiệm");
  await expect(page.getByTestId("run-confirm")).toHaveCount(0);
  await expect(page.getByTestId("run-button")).toBeEnabled();
  expect(runs.count()).toBe(0);
  expect(await latestRunId(page, id)).toBeNull();
});

test("minimap góc dưới phải không che nút điều khiển; nhóm tay không có dòng kiểm luật", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  const id = `uoc-tinh-${uid()}`;
  await putFakeVideo(page, id);
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("card-q")).toBeVisible();

  const minimap = page.getByTestId("minimap");
  await expect(minimap).toBeVisible();
  const mini = (await minimap.boundingBox())!;
  const controls = (await page.locator(".react-flow__controls").boundingBox())!;
  const canvas = (await page.locator(".canvas").boundingBox())!;
  expect(mini.x).toBeGreaterThan(canvas.x + canvas.width / 2);
  expect(mini.x + mini.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
  expect(mini.y + mini.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
  const overlap = mini.x < controls.x + controls.width && mini.x + mini.width > controls.x && mini.y < controls.y + controls.height && mini.y + mini.height > controls.y;
  expect(overlap).toBe(false);
  // Nút điều khiển cùng góc dưới phải (spec 8.1), nằm trong canvas, không chạm khung bên phải.
  expect(controls.x).toBeGreaterThan(canvas.x + canvas.width / 2);
  expect(controls.x + controls.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
  expect(controls.y + controls.height).toBeLessThanOrEqual(mini.y + 1);

  await page.getByTestId("card-p").click();
  await page.getByTestId("card-q").click({ modifiers: ["Control"] });
  await page.keyboard.press("Control+g");
  await expect(page.getByTestId("group-manual-1")).toBeVisible();
  await expect(page.getByTestId("group-rule-manual-1")).toHaveCount(0);
});

test("đang chạy: ô hàng chờ có dòng node đang chạy, bấm Huỷ trong ô → Lỗi 'Đã huỷ'; khung Phân cảnh ghi '✓ Luật đạo diễn đạt'", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto("/");
  await page.getByTestId("template-sinh-ton-son-la").click();
  await expect(page).toHaveURL(/wf=sinh-ton-son-la-/);
  const wfId = new URL(page.url()).searchParams.get("wf")!;
  await expect(page.getByTestId("node-scene-g1-12")).toBeVisible();
  await useFakeSonLa(page, wfId);
  await page.reload();
  await expect(page.getByTestId("node-scene-g1-12")).toBeVisible();

  // Có ước tính rồi (Sơn La không có cảnh báo) thì khung Phân cảnh ghi đạt; chưa chọn node nào nên chưa có ô hàng chờ.
  await expect(page.getByTestId("group-rule-g1")).toHaveText("✓ Luật đạo diễn đạt");
  await expect(page.getByTestId("queue-panel")).toHaveCount(0);

  await runAllConfirmed(page);
  // Đang chạy thì ô hàng chờ hiện dù không chọn node nào, có ít nhất một dòng node đang chạy, và có nút Huỷ.
  await expect(page.getByTestId("queue-panel")).toBeVisible();
  await expect(page.getByTestId("cancel-run")).toBeVisible();
  await expect.poll(() => page.locator('[data-testid^="queue-row-"]').count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("queue-progress")).toContainText(/node xong/);
  await page.getByTestId("cancel-run").click();

  await expect(page.getByTestId("run-status")).toHaveText("Lỗi", { timeout: 60_000 });
  await expect(page.getByTestId("problem-banner")).toContainText("Đã huỷ");
  await expect(page.getByTestId("cancel-run")).toHaveCount(0);
  // Rảnh rồi: một dòng nhỏ ở góc dưới trái ghi lần chạy trước, kể cả khi chưa chọn node nào (khung bên phải không mở).
  await expect(page.getByTestId("queue-last")).toContainText("Lỗi");
  await expect(page.getByTestId("queue-last")).toContainText("Đã huỷ");
  await expect(page.getByTestId("inspector")).toHaveCount(0);
});
