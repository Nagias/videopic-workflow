import { expect, test, type Page } from "@playwright/test";

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function putWorkflow(page: Page, id: string, graph: unknown) {
  expect((await page.request.put(`/api/workflows/${id}`, { data: { graph } })).ok()).toBe(true);
}

const at = (x: number, y: number) => ({ x, y });

test("thẻ không có ô nhập: mọi thẻ node không chứa input, textarea, select; Prompt chỉ có ô nhập khi nháy đúp, Escape thì mất", async ({ page }) => {
  const id = `the-khong-form-${uid()}`;
  await putWorkflow(page, id, {
    nodes: [
      { id: "p", type: "prompt", position: at(0, 0), params: { text: "Rừng sương sớm" } },
      { id: "v", type: "generate-video", position: at(340, 0), params: { provider: "fake", durationSec: 5 } },
      { id: "c", type: "character", position: at(680, 0), params: { name: "Mai", description: "cô gái tóc đen buộc đuôi ngựa, áo khoác xám", provider: "fake" } },
      { id: "l", type: "location", position: at(0, 300), params: { description: "bãi cỏ bên suối đá, trời âm u", provider: "fake" } },
      { id: "pr", type: "props", position: at(340, 300), params: { name: "", items: [], provider: "fake" } },
      { id: "w", type: "writer", position: at(680, 300), params: { idea: "Cô gái dựng lều bên suối rồi nhóm lửa nấu nước", shotCount: 12, provider: "fake" } },
      { id: "s", type: "scene", position: at(0, 600), params: { size: "MS", angle: "eye", move: "static", subject: "character", start: "", motion: "cô đi về phía lều", props: "", provider: "fake" } },
      { id: "f", type: "film-combine", position: at(340, 600), params: { fixBrightness: true } },
    ],
    edges: [],
  });
  await page.goto(`/?wf=${id}`);
  for (const n of ["p", "v", "c", "l", "pr", "w", "s", "f"]) await expect(page.getByTestId(`card-${n}`)).toBeVisible();

  const counts = () =>
    page.locator(".react-flow__node").evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-id"), fields: e.querySelectorAll("input, textarea, select").length })));
  expect((await counts()).filter((c) => c.fields > 0)).toEqual([]);

  await page.getByTestId("card-p").dblclick();
  await expect(page.getByTestId("card-edit-p")).toBeVisible();
  expect((await counts()).filter((c) => c.fields > 0).map((c) => c.id)).toEqual(["p"]);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("card-edit-p")).toHaveCount(0);
  expect((await counts()).filter((c) => c.fields > 0)).toEqual([]);
});

test("Prompt: nháy đúp sửa chữ ngay trên thẻ, Escape kết thúc, chữ mới hiện trên thẻ và được lưu", async ({ page }) => {
  const id = `prompt-tren-the-${uid()}`;
  await putWorkflow(page, id, { nodes: [{ id: "p", type: "prompt", position: at(0, 0), params: { text: "chữ ban đầu" } }], edges: [] });
  await page.goto(`/?wf=${id}`);
  const card = page.getByTestId("card-p");
  await expect(card).toContainText("chữ ban đầu");
  await card.dblclick();
  const edit = page.getByTestId("card-edit-p");
  await expect(edit).toBeVisible();
  await edit.fill("chữ sửa ngay trên thẻ");
  await page.keyboard.press("Escape");
  await expect(edit).toHaveCount(0);
  await expect(card).toContainText("chữ sửa ngay trên thẻ");
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect
    .poll(async () => ((await (await page.request.get(`/api/workflows/${id}`)).json()) as { graph: { nodes: { params: { text: string } }[] } }).graph.nodes[0]!.params.text)
    .toBe("chữ sửa ngay trên thẻ");
});

test("chọn thẻ Cảnh → khung phải có ô chuyển động; sửa → Đã lưu; bỏ chọn (bấm nền hoặc Escape) → khung đóng", async ({ page }) => {
  const id = `chon-canh-${uid()}`;
  await putWorkflow(page, id, {
    nodes: [{ id: "s", type: "scene", position: at(0, 0), params: { size: "MS", angle: "eye", move: "static", subject: "character", start: "", motion: "ban đầu", props: "", provider: "fake" } }],
    edges: [],
  });
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("inspector")).toHaveCount(0);
  await page.getByTestId("card-s").click();
  await expect(page.getByTestId("inspector")).toBeVisible();
  const motion = page.getByTestId("scene-motion-s");
  await expect(motion).toHaveValue("ban đầu");
  await motion.fill("cô đi chậm về phía lều");
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect
    .poll(async () => ((await (await page.request.get(`/api/workflows/${id}`)).json()) as { graph: { nodes: { params: { motion: string } }[] } }).graph.nodes[0]!.params.motion)
    .toBe("cô đi chậm về phía lều");

  await page.locator(".react-flow__pane").click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId("inspector")).toHaveCount(0);

  await page.getByTestId("card-s").click();
  await expect(page.getByTestId("scene-motion-s")).toHaveValue("cô đi chậm về phía lều");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("inspector")).toHaveCount(0);
});

test("tab Prompt gửi Muse của Cảnh có chữ 'không nhìn vào máy quay' và mô tả nhân vật; node khác ghi 'Prompt được tạo khi chạy'", async ({ page }) => {
  const id = `prompt-muse-${uid()}`;
  const description = "cô gái tóc đen buộc đuôi ngựa, áo khoác xám";
  await putWorkflow(page, id, {
    nodes: [
      { id: "c", type: "character", position: at(0, 0), params: { name: "Mai", description, provider: "fake" } },
      { id: "l", type: "location", position: at(0, 300), params: { description: "bãi cỏ bên suối đá, trời âm u", provider: "fake" } },
      { id: "s", type: "scene", position: at(420, 100), params: { size: "MS", angle: "eye", move: "static", subject: "character", start: "cô đứng bên suối", motion: "cô cúi xuống múc nước", props: "", provider: "fake" } },
    ],
    edges: [
      { id: "e1", source: "c", sourceHandle: "character", target: "s", targetHandle: "character" },
      { id: "e2", source: "l", sourceHandle: "location", target: "s", targetHandle: "location" },
    ],
  });
  await page.goto(`/?wf=${id}`);
  await page.getByTestId("card-s").click();
  await page.getByTestId("inspector-tab-prompt").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toContainText("không nhìn vào máy quay");
  await expect(inspector).toContainText("cô cúi xuống múc nước");
  await expect(inspector).toContainText(description);

  await page.getByTestId("card-c").click();
  await page.getByTestId("inspector-tab-prompt").click();
  await expect(inspector).toContainText("Prompt được tạo khi chạy");
});

test("tab Kết quả: clip của lần chạy, và lỗi đầy đủ khi chạy hỏng", async ({ page }) => {
  const id = `ket-qua-${uid()}`;
  await putWorkflow(page, id, {
    nodes: [
      { id: "p", type: "prompt", position: at(0, 0), params: { text: `Rừng sương sớm ${id}` } },
      { id: "v", type: "generate-video", position: at(420, 0), params: { provider: "fake", durationSec: 5 } },
      { id: "p2", type: "prompt", position: at(0, 300), params: { text: "Sản phẩm trên bàn gỗ" } },
      { id: "v2", type: "generate-video", position: at(420, 300), params: { provider: "muse", durationSec: 5 } },
    ],
    edges: [
      { id: "e", source: "p", sourceHandle: "text", target: "v", targetHandle: "prompt" },
      { id: "e2", source: "p2", sourceHandle: "text", target: "v2", targetHandle: "prompt" },
    ],
  });
  await page.goto(`/?wf=${id}`);
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("run-status")).toHaveText("Lỗi", { timeout: 60_000 });
  await expect(page.getByTestId("node-status-v")).toHaveText("Xong");

  await expect(page.getByTestId("card-v").locator("video")).toHaveCount(1);
  await page.getByTestId("card-v").click();
  await page.getByTestId("inspector-tab-result").click();
  await expect(page.getByTestId("result-media-v").locator("video")).toBeVisible();

  await page.getByTestId("card-v2").click();
  await page.getByTestId("inspector-tab-result").click();
  await expect(page.getByTestId("result-error-v2")).toContainText(/Test không được gọi Muse thật|npm run muse:login/);
});

test("sửa trong khung phải lúc máy chủ đã có bản mới hơn (409): thanh báo nói rõ, canvas và khung phải hiện giá trị của máy chủ, không ghi đè", async ({ page }) => {
  const id = `xung-dot-${uid()}`;
  await putWorkflow(page, id, { nodes: [{ id: "p", type: "prompt", position: at(0, 0), params: { text: "bản đầu" } }], edges: [] });
  await page.goto(`/?wf=${id}`);
  await page.getByTestId("card-p").click();
  const box = page.getByTestId("prompt-text-p");
  await box.fill("bản của giao diện");
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");

  // Người khác (ở đây: gọi thẳng API) ghi một bản mới dựa trên đúng bản giao diện vừa lưu.
  const current = (await (await page.request.get(`/api/workflows/${id}`)).json()) as { updatedAt: number; graph: { nodes: unknown[]; edges: unknown[] } };
  const other = await page.request.put(`/api/workflows/${id}`, {
    data: {
      graph: { ...current.graph, nodes: [{ id: "p", type: "prompt", position: at(0, 0), params: { text: "bản của người khác" } }] },
      baseUpdatedAt: current.updatedAt,
    },
  });
  expect(other.ok()).toBe(true);

  await box.fill("bản thứ ba của giao diện");
  await expect(page.getByTestId("problem-banner")).toContainText("Workflow vừa được cập nhật ở nơi khác");
  await expect(box).toHaveValue("bản của người khác");
  await expect(page.getByTestId("card-p")).toContainText("bản của người khác");
  await expect
    .poll(async () => ((await (await page.request.get(`/api/workflows/${id}`)).json()) as { graph: { nodes: { params: { text: string } }[] } }).graph.nodes[0]!.params.text)
    .toBe("bản của người khác");
});

test("thu nhỏ dưới 0.45: thẻ chỉ còn ảnh và tên, phóng lại thì đủ trạng thái", async ({ page }) => {
  const id = `thu-nho-${uid()}`;
  await putWorkflow(page, id, { nodes: [{ id: "p", type: "prompt", position: at(0, 0), params: { text: "chữ" } }], edges: [] });
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("node-status-p")).toBeVisible();
  const zoomOut = page.locator(".react-flow__controls-zoomout");
  for (let i = 0; i < 12; i++) await zoomOut.click();
  await expect(page.getByTestId("card-label-p")).toBeVisible();
  await expect(page.getByTestId("node-status-p")).toBeHidden();
  const zoomIn = page.locator(".react-flow__controls-zoomin");
  for (let i = 0; i < 12; i++) await zoomIn.click();
  await expect(page.getByTestId("node-status-p")).toBeVisible();
});

test("mở workflow lớn (mẫu Sinh tồn Sơn La, 12 cảnh): vừa màn hình nhưng không rơi vào chế độ thu nhỏ", async ({ page }) => {
  const created = (await (await page.request.post("/api/workflows/from-template/sinh-ton-son-la", { data: {} })).json()) as { id: string };
  await page.goto(`/?wf=${created.id}`);
  await expect(page.getByTestId("card-scene-g1-12")).toBeVisible();
  await expect(page.locator(".gnode.compact")).toHaveCount(0);
  await expect(page.getByTestId("node-status-scene-g1-1")).toBeVisible();
});
