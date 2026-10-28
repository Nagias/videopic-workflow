import { expect, test, type Page } from "@playwright/test";

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function putWorkflow(page: Page, id: string, graph: unknown) {
  expect((await page.request.put(`/api/workflows/${id}`, { data: { graph } })).ok()).toBe(true);
}

async function drag(page: Page, from: string, to: string) {
  const a = await page.locator(from).boundingBox();
  const b = await page.locator(to).boundingBox();
  if (!a || !b) throw new Error(`Không thấy cổng ${a ? to : from}`);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

const handle = (nodeId: string, port: string, side: "source" | "target") =>
  `[data-testid="node-${nodeId}"] .react-flow__handle.${side}[data-handleid="${port}"]`;

test("mở lại workflow đã chạy: ảnh/clip của lần chạy trước hiện lại, ghi rõ là lần trước", async ({ page }) => {
  const id = `lan-truoc-${uid()}`;
  await putWorkflow(page, id, {
    nodes: [
      { id: "p", type: "prompt", position: { x: 0, y: 0 }, params: { text: `Rừng sương sớm ${id}` } },
      { id: "v", type: "generate-video", position: { x: 420, y: 0 }, params: { provider: "fake", durationSec: 5 } },
    ],
    edges: [{ id: "e", source: "p", sourceHandle: "text", target: "v", targetHandle: "prompt" }],
  });
  const { runId } = (await (await page.request.post(`/api/workflows/${id}/runs`, { data: {} })).json()) as { runId: string };
  await expect
    .poll(async () => ((await (await page.request.get(`/api/runs/${runId}`)).json()) as { status: string }).status, { timeout: 45_000 })
    .toBe("succeeded");

  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("video-preview-v")).toBeVisible();
  await expect(page.getByTestId("node-status-v")).toHaveText("Xong");
  await expect(page.getByTestId("run-status")).toHaveText("Lần trước: Chạy xong");
});

test("kéo dây sai loại: dây không nối, thanh báo nói rõ lý do và chỗ cắm đúng", async ({ page }) => {
  const id = `noi-sai-${uid()}`;
  await putWorkflow(page, id, {
    nodes: [
      { id: "c", type: "character", position: { x: 0, y: 0 }, params: { name: "", description: "", provider: "fake" } },
      { id: "v", type: "generate-video", position: { x: 480, y: 0 }, params: { provider: "fake", durationSec: 5 } },
    ],
    edges: [],
  });
  await page.goto(`/?wf=${id}`);
  await drag(page, handle("c", "character", "source"), handle("v", "prompt", "target"));
  await expect(page.getByTestId("problem-banner")).toContainText("cần Chữ");
  await expect(page.getByTestId("problem-banner")).toContainText("Bộ ảnh cắm được vào");
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
});

test("cắm dây vào cổng đã có dây: dây mới thay dây cũ", async ({ page }) => {
  const id = `thay-day-${uid()}`;
  await putWorkflow(page, id, {
    nodes: [
      { id: "p1", type: "prompt", position: { x: 0, y: 0 }, params: { text: "một" } },
      { id: "p2", type: "prompt", position: { x: 0, y: 320 }, params: { text: "hai" } },
      { id: "v", type: "generate-video", position: { x: 480, y: 0 }, params: { provider: "fake", durationSec: 5 } },
    ],
    edges: [{ id: "e1", source: "p1", sourceHandle: "text", target: "v", targetHandle: "prompt" }],
  });
  await page.goto(`/?wf=${id}`);
  await drag(page, handle("p2", "text", "source"), handle("v", "prompt", "target"));
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect
    .poll(async () => ((await (await page.request.get(`/api/workflows/${id}`)).json()) as { graph: { edges: { source: string }[] } }).graph.edges.map((e) => e.source))
    .toEqual(["p2"]);
});

test("thêm node: hiện giữa màn hình, được chọn sẵn, dùng cùng dịch vụ với workflow", async ({ page }) => {
  const id = `them-node-${uid()}`;
  await putWorkflow(page, id, {
    nodes: [{ id: "v", type: "generate-video", position: { x: 0, y: 0 }, params: { provider: "muse", durationSec: 5 } }],
    edges: [],
  });
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("node-v")).toBeVisible();
  await page.getByTestId("add-node").selectOption("character");
  const added = page.locator('.react-flow__node-character');
  await expect(added).toHaveCount(1);
  await expect(added).toHaveClass(/selected/);
  await expect(added.locator("select[data-testid^=provider-select-]")).toHaveValue("muse");

  const box = await added.boundingBox();
  const canvas = await page.locator(".canvas").boundingBox();
  if (!box || !canvas) throw new Error("Không đo được vị trí node");
  const cx = box.x + box.width / 2;
  expect(Math.abs(cx - (canvas.x + canvas.width / 2))).toBeLessThan(canvas.width / 4);
  expect(box.y).toBeGreaterThanOrEqual(canvas.y);
  expect(box.y).toBeLessThan(canvas.y + canvas.height / 2);
});
