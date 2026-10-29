import { expect, test, type Page } from "@playwright/test";

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type SavedGraph = {
  graph: {
    nodes: { id: string; type: string; position: { x: number; y: number } }[];
    edges: { id: string }[];
    groups: { id: string; nodeIds: string[]; manual?: boolean; source?: unknown }[];
  };
};
const readGraph = async (page: Page, id: string) => ((await (await page.request.get(`/api/workflows/${id}`)).json()) as SavedGraph).graph;

// Thẻ mới hiện sau lúc mở (máy chủ tạo thẻ cảnh) nằm ngoài vùng nhìn: bấm "vừa màn hình" trước khi đo và kéo.
async function fit(page: Page) {
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(500);
}

// Kéo tiêu đề nhóm sang phải `dx` điểm ảnh trên màn hình.
async function dragTitle(page: Page, groupId: string, dx: number) {
  const box = await page.getByTestId(`group-title-${groupId}`).boundingBox();
  const view = page.viewportSize();
  if (!box || !view) throw new Error(`Không thấy tiêu đề nhóm ${groupId}`);
  if (box.x < 0 || box.y < 0 || box.x + 60 > view.width || box.y + box.height > view.height) throw new Error(`Tiêu đề nhóm ${groupId} nằm ngoài vùng nhìn: ${JSON.stringify(box)}`);
  const x = box.x + Math.min(box.width / 2, 30);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 8 });
  await page.mouse.move(x + dx, y, { steps: 8 });
  await page.mouse.up();
}

test("kéo tiêu đề nhóm 200px → cả 12 thẻ dời, lưu, chạy lại không ra decision", async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto("/");
  await page.getByTestId("template-sinh-ton-son-la").click();
  await expect(page).toHaveURL(/wf=sinh-ton-son-la-/);
  const wfId = new URL(page.url()).searchParams.get("wf")!;
  await expect(page.getByTestId("node-scene-g1-12")).toBeVisible();
  // Đổi mọi node sang dịch vụ giả qua API (để chạy được mà không tốn Muse), rồi mở lại.
  const loaded = (await (await page.request.get(`/api/workflows/${wfId}`)).json()) as { graph: { nodes: { params: Record<string, unknown> }[] } };
  const fake = { ...loaded.graph, nodes: loaded.graph.nodes.map((n) => ("provider" in n.params ? { ...n, params: { ...n.params, provider: "fake" } } : n)) };
  expect((await page.request.put(`/api/workflows/${wfId}`, { data: { graph: fake } })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId("node-scene-g1-12")).toBeVisible();

  // Khung bao nhóm 12 cảnh, tiêu đề theo bản phác; 36 dây tham chiếu vẽ gộp thành 3 dây tới mép khung.
  await expect(page.getByTestId("group-g1")).toBeVisible();
  await expect(page.getByTestId("group-title-g1")).toHaveText("▢ Phân cảnh · 12 cảnh");
  await expect(page.getByTestId("group-rule-g1")).toHaveCount(0);
  await expect(page.locator('.react-flow__edge[data-id^="bundle-g1-"]')).toHaveCount(3);
  await expect(page.locator(".react-flow__edge")).toHaveCount(17);
  const before = await readGraph(page, wfId);
  expect(before.edges.filter((e) => e.id.startsWith("bundle-"))).toHaveLength(0);
  expect(before.edges).toHaveLength(14 + 36);
  expect(before.nodes.some((n) => n.type === "group-frame")).toBe(false);

  const ids = before.groups[0]!.nodeIds;
  expect(ids).toHaveLength(12);
  await fit(page);
  const cardBefore = await page.getByTestId("node-scene-g1-1").boundingBox();
  const outsideBefore = await page.getByTestId("node-character-1").boundingBox();
  await dragTitle(page, "g1", 200);

  // Cả 12 thẻ dời cùng một đoạn, node ngoài nhóm đứng yên; đồ thị lưu có đúng toạ độ mới.
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  const cardAfter = await page.getByTestId("node-scene-g1-1").boundingBox();
  // xyflow bỏ bước di chuyển đầu tiên làm ngưỡng bắt đầu kéo (thẻ thường kéo 200px cũng chỉ dời 188px), nên chỉ đòi gần 200px.
  const shift = cardAfter!.x - cardBefore!.x;
  expect(shift).toBeGreaterThan(170);
  expect(shift).toBeLessThanOrEqual(200);
  expect(Math.round(cardAfter!.y - cardBefore!.y)).toBe(0);
  const outsideAfter = await page.getByTestId("node-character-1").boundingBox();
  expect(outsideAfter!.x).toBe(outsideBefore!.x);
  await expect
    .poll(async () => {
      const after = await readGraph(page, wfId);
      const moved = ids.map((id) => after.nodes.find((n) => n.id === id)!.position.x - before.nodes.find((n) => n.id === id)!.position.x);
      return { allSame: new Set(moved).size === 1, positive: moved[0]! > 0 };
    })
    .toEqual({ allSame: true, positive: true });
  const after = await readGraph(page, wfId);
  expect(after.nodes.find((n) => n.id === "character-1")!.position).toEqual(before.nodes.find((n) => n.id === "character-1")!.position);
  expect(after.edges).toHaveLength(14 + 36);
  expect(after.groups).toEqual(before.groups);
  expect(after.nodes.some((n) => n.type === "group-frame")).toBe(false);

  // Chọn khung không mở khung bên phải.
  await expect(page.getByTestId("inspector")).toHaveCount(0);

  // Chạy sau khi dời nhóm: chạy được, không dừng hỏi Thay/Giữ, và khung ghi tổng thời lượng 12 clip.
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 300_000 });
  await expect(page.getByTestId("scenes-decision")).toHaveCount(0);
  await expect(page.getByTestId("node-status-scene-g1-12")).toHaveText("Xong");
  await expect(page.getByTestId("group-title-g1")).toHaveText(/^▢ Phân cảnh · 12 cảnh · [\d,]+ giây$/);
  await expect(page.getByTestId("group-rule-g1")).toHaveCount(0);
});

test("kéo nhóm không phải là sửa tay: Biên kịch ra bộ cảnh mới thì thay thẳng, không hiện hộp Thay/Giữ", async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto("/");
  await page.getByTestId("template-y-tuong-thanh-phim").click();
  await expect(page).toHaveURL(/wf=y-tuong-thanh-phim-/);
  for (const id of ["character-1", "location-1", "writer-1", "props-1"]) {
    await page.getByTestId(`card-${id}`).click();
    await page.getByTestId(`provider-select-${id}`).selectOption("fake");
  }
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");

  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 240_000 });
  await expect(page.getByTestId("node-scene-g1-8")).toBeVisible();
  await expect(page.getByTestId("group-title-g1")).toHaveText(/^▢ Phân cảnh · 8 cảnh · [\d,]+ giây$/);

  await fit(page);
  const cardBefore = (await page.getByTestId("node-scene-g1-1").boundingBox())!;
  await dragTitle(page, "g1", 200);
  await expect.poll(async () => (await page.getByTestId("node-scene-g1-1").boundingBox())!.x - cardBefore.x).toBeGreaterThan(170);
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");

  // Đổi ý tưởng rồi chạy lại: nhóm chưa bị sửa tay (chỉ dời chỗ) nên được tạo lại, không dừng hỏi.
  await page.getByTestId("card-writer-1").click();
  await page.getByTestId("writer-idea-writer-1").fill("Cô gái đi dọc bờ suối tìm củi khô rồi nhóm lửa trước lều.");
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 240_000 });
  await expect(page.getByTestId("scenes-decision")).toHaveCount(0);
  await expect(page.getByTestId("node-status-scene-g1-8")).toHaveText("Xong");
});

test("Ctrl+G gom các node đang chọn thành nhóm tay: khung hiện, được lưu, tên node không đổi; chọn dưới 2 node thì không làm gì", async ({ page }) => {
  const id = `nhom-tay-${uid()}`;
  const prompt = (n: string, x: number, y: number) => ({ id: n, type: "prompt", position: { x, y }, params: { text: `Chữ của ${n}` } });
  expect(
    (await page.request.put(`/api/workflows/${id}`, { data: { graph: { nodes: [prompt("p1", 0, 0), prompt("p2", 400, 100), prompt("p3", 0, 500)], edges: [] } } })).ok(),
  ).toBe(true);
  await page.goto(`/?wf=${id}`);
  for (const n of ["p1", "p2", "p3"]) await expect(page.getByTestId(`card-${n}`)).toBeVisible();
  const labelsBefore = await page.locator('[data-testid^="card-label-"]').allTextContents();

  // Chọn một node rồi Ctrl+G: không đủ 2 node, không tạo nhóm.
  await page.getByTestId("card-p1").click();
  await page.keyboard.press("Control+g");
  await expect(page.locator('[data-testid^="group-manual-"]')).toHaveCount(0);

  // Chọn p1 + p2 (giữ Ctrl khi bấm) rồi Ctrl+G.
  await page.getByTestId("card-p2").click({ modifiers: ["Control"] });
  await page.keyboard.press("Control+g");
  await expect(page.getByTestId("group-manual-1")).toBeVisible();
  await expect(page.getByTestId("group-title-manual-1")).toHaveText("▢ Nhóm 1 · 2 node");
  await expect(page.getByTestId("group-rule-manual-1")).toHaveCount(0);
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect.poll(async () => (await readGraph(page, id)).groups).toEqual([{ id: "manual-1", label: "Nhóm 1", nodeIds: ["p1", "p2"], manual: true }]);
  expect((await readGraph(page, id)).nodes.map((n) => n.id)).toEqual(["p1", "p2", "p3"]);
  expect(await page.locator('[data-testid^="card-label-"]').allTextContents()).toEqual(labelsBefore);

  // Kéo tiêu đề nhóm tay: hai thành viên dời, p3 đứng yên.
  const p1 = await readGraph(page, id);
  await dragTitle(page, "manual-1", 150);
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect
    .poll(async () => {
      const g = await readGraph(page, id);
      const dx = (nid: string) => g.nodes.find((n) => n.id === nid)!.position.x - p1.nodes.find((n) => n.id === nid)!.position.x;
      return { same: dx("p1") === dx("p2") && dx("p1") > 0, p3: dx("p3") };
    })
    .toEqual({ same: true, p3: 0 });

  // Khung và một thẻ thành viên cùng được chọn rồi kéo tiêu đề: thẻ đó không bị dời hai lần (cả hai thẻ vẫn dời bằng nhau).
  const p2 = await readGraph(page, id);
  await page.getByTestId("group-title-manual-1").click();
  await page.getByTestId("card-p1").click({ modifiers: ["Control"] });
  await dragTitle(page, "manual-1", 100);
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect
    .poll(async () => {
      const g = await readGraph(page, id);
      const dx = (nid: string) => g.nodes.find((n) => n.id === nid)!.position.x - p2.nodes.find((n) => n.id === nid)!.position.x;
      return { same: dx("p1") === dx("p2") && dx("p1") > 50, p3: dx("p3") };
    })
    .toEqual({ same: true, p3: 0 });

  // Mở lại: khung nhóm tay vẫn còn.
  await page.reload();
  await expect(page.getByTestId("group-title-manual-1")).toHaveText("▢ Nhóm 1 · 2 node");
});
