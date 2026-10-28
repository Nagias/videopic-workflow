import { expect, test } from "@playwright/test";

test("workflow cũ (cảnh dạng `action` trước 28/10) mở ra không sập giao diện, chuyển động hiện đúng chữ cũ", async ({ page, request }) => {
  const id = `cu-${Date.now().toString(36)}`;
  const graph = {
    nodes: [
      {
        id: "shotlist-1",
        type: "shotlist",
        position: { x: 0, y: 0 },
        params: { shots: [{ id: "c01", size: "WS", angle: "eye", move: "static", subject: "character", link: "cut", action: "cô đi về phía lều" }] },
      },
    ],
    edges: [],
  };
  expect((await request.put(`/api/workflows/${id}`, { data: { graph } })).ok()).toBe(true);
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("shot-motion-shotlist-1-1")).toHaveValue("cô đi về phía lều");
  await expect(page.getByTestId("shot-start-shotlist-1-1")).toHaveValue("cô đi về phía lều");
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
