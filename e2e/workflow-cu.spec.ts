import { expect, test } from "@playwright/test";

test("workflow cũ (Danh sách cảnh + Dựng phim, cảnh dạng `action` trước 28/10) mở ra tự chuyển sang node Cảnh + Ghép phim, chữ cũ giữ nguyên, có bản cũ", async ({ page, request }) => {
  const id = `cu-${Date.now().toString(36)}`;
  const graph = {
    nodes: [
      { id: "character-1", type: "character", position: { x: 0, y: 0 }, params: { description: "cô gái tóc đen buộc đuôi ngựa, áo xám", provider: "fake" } },
      { id: "location-1", type: "location", position: { x: 0, y: 600 }, params: { description: "bãi cỏ bên suối đá", provider: "fake" } },
      {
        id: "shotlist-1",
        type: "shotlist",
        position: { x: 480, y: 0 },
        params: { shots: [{ id: "c01", size: "WS", angle: "eye", move: "static", subject: "character", link: "cut", action: "cô đi về phía lều" }] },
      },
      { id: "film-1", type: "film", position: { x: 1100, y: 0 }, params: { provider: "fake", fixBrightness: true } },
    ],
    edges: [
      { id: "e-char-film", source: "character-1", sourceHandle: "character", target: "film-1", targetHandle: "character" },
      { id: "e-loc-film", source: "location-1", sourceHandle: "location", target: "film-1", targetHandle: "location" },
      { id: "e-shots-film", source: "shotlist-1", sourceHandle: "shots", target: "film-1", targetHandle: "shots" },
    ],
  };
  expect((await request.put(`/api/workflows/${id}`, { data: { graph, name: "Workflow cũ thử" } })).ok()).toBe(true);
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("node-scene-g1-1")).toBeVisible();
  await expect(page.getByTestId("scene-motion-scene-g1-1")).toHaveValue("cô đi về phía lều");
  await expect(page.getByTestId("scene-start-scene-g1-1")).toHaveValue("cô đi về phía lều");
  await expect(page.getByTestId("node-combine-g1")).toBeVisible();
  await expect(page.getByTestId("node-film-1")).toHaveCount(0);
  await expect(page.getByTestId("node-shotlist-1")).toHaveCount(0);
  await expect(page.getByTestId("workflow-notice")).toHaveCount(0);
  await expect(page.getByTestId("workflow-select")).toContainText("Workflow cũ thử (bản cũ)");
});

test("workflow cũ không chuyển được (dịch vụ của Dựng phim lạ): vẫn mở được, thấy lời báo, node cũ giữ nguyên", async ({ page, request }) => {
  const id = `cu-loi-${Date.now().toString(36)}`;
  const graph = {
    nodes: [
      {
        id: "shotlist-1",
        type: "shotlist",
        position: { x: 0, y: 0 },
        params: { shots: [{ id: "c01", size: "WS", angle: "eye", move: "static", subject: "none", link: "cut", start: "bãi cỏ bên suối", motion: "gió thổi qua cỏ" }] },
      },
      { id: "film-1", type: "film", position: { x: 600, y: 0 }, params: { provider: "khong-co", fixBrightness: true } },
    ],
    edges: [{ id: "e-shots-film", source: "shotlist-1", sourceHandle: "shots", target: "film-1", targetHandle: "shots" }],
  };
  expect((await request.put(`/api/workflows/${id}`, { data: { graph } })).ok()).toBe(true);
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("workflow-notice")).toContainText("Không chuyển được workflow cũ");
  await expect(page.getByTestId("node-film-1")).toBeVisible();
  await expect(page.getByTestId("shot-motion-shotlist-1-1")).toHaveValue("gió thổi qua cỏ");
});

test("chọn nhân vật từ kho thay TOÀN BỘ tham số node (không giữ tên cũ) để trúng lại kết quả cũ", async ({ page, request }) => {
  const description = `Cô gái thử kho ${Date.now().toString(36)}, áo khoác đỏ`;
  const src = `kho-a-${Date.now().toString(36)}`;
  const graphA = { nodes: [{ id: "c", type: "character", position: { x: 0, y: 0 }, params: { description, provider: "fake" } }], edges: [] };
  expect((await request.put(`/api/workflows/${src}`, { data: { graph: graphA } })).ok()).toBe(true);
  const { runId } = (await (await request.post(`/api/workflows/${src}/runs`, { data: {} })).json()) as { runId: string };
  await expect.poll(async () => ((await (await request.get(`/api/runs/${runId}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe("succeeded");

  const dst = `kho-b-${Date.now().toString(36)}`;
  const graphB = { nodes: [{ id: "character-1", type: "character", position: { x: 0, y: 0 }, params: { name: "Tên khác", description: "một người hoàn toàn khác, tóc bạc, áo xanh", provider: "muse" } }], edges: [] };
  expect((await request.put(`/api/workflows/${dst}`, { data: { graph: graphB } })).ok()).toBe(true);
  await page.goto(`/?wf=${dst}`);
  const pick = page.getByTestId("asset-pick-character-1");
  await expect(pick.locator("option", { hasText: description })).toHaveCount(1);
  await pick.selectOption({ label: description });
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  const saved = (await (await request.get(`/api/workflows/${dst}`)).json()) as { graph: { nodes: { params: unknown }[] } };
  expect(saved.graph.nodes[0]!.params).toEqual({ description, provider: "fake" });
});
