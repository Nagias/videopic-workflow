import { expect, test, type Page } from "@playwright/test";

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const at = (x: number, y: number) => ({ x, y });

type SavedNode = { id: string; type: string; position: { x: number; y: number }; params: Record<string, unknown> };
type SavedGraph = { nodes: SavedNode[]; edges: { source: string; target: string }[]; groups: { id: string; nodeIds: string[]; manual?: boolean }[] };
const readGraph = async (page: Page, id: string) => ((await (await page.request.get(`/api/workflows/${id}`)).json()) as { graph: SavedGraph }).graph;

type RunNodes = Record<string, { status: string; output: unknown }>;
const latestRun = async (page: Page, wfId: string) =>
  (await (await page.request.get(`/api/workflows/${wfId}/runs/latest`)).json()) as { run: { id: string; status: string } | null; nodes: RunNodes };
const runNodes = async (page: Page, runId: string) => ((await (await page.request.get(`/api/runs/${runId}`)).json()) as { nodes: RunNodes }).nodes;

// Chờ một lần chạy MỚI (khác lần `previousId`) chạy xong.
async function waitNewRun(page: Page, wfId: string, previousId: string | undefined, timeout = 240_000) {
  await expect
    .poll(async () => {
      const { run } = await latestRun(page, wfId);
      return run && run.id !== previousId && run.status !== "queued" && run.status !== "running" ? "xong" : "dang-chay";
    }, { timeout })
    .toBe("xong");
  const { run } = await latestRun(page, wfId);
  const failed = Object.entries(await runNodes(page, run!.id)).filter(([, n]) => n.status === "failed");
  expect({ status: run!.status, failed }).toEqual({ status: "succeeded", failed: [] });
  return (await latestRun(page, wfId)).run!.id;
}

async function rightClick(page: Page, testid: string) {
  await page.getByTestId(testid).click({ button: "right" });
  await expect(page.getByTestId("context-menu")).toBeVisible();
}

// Các điểm trống của nền canvas (ngoài thẻ, khung nhóm và nút điều khiển), gần góc dưới phải nhất đứng đầu.
async function emptySpots(page: Page) {
  const spots = await page.evaluate(() => {
    const canvas = document.querySelector(".canvas")!.getBoundingClientRect();
    const out: { x: number; y: number }[] = [];
    for (let y = canvas.bottom - 40; y > canvas.top + 40; y -= 40) {
      for (let x = canvas.right - 40; x > canvas.left + 40; x -= 40) {
        if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) out.push({ x, y });
      }
    }
    return out;
  });
  if (spots.length < 3) throw new Error("Không tìm được chỗ trống trên canvas");
  return spots;
}

// Kéo nền canvas từ một điểm trống: khung nhìn đổi.
async function panCanvas(page: Page) {
  const from = (await emptySpots(page))[1]!;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 90, from.y - 50, { steps: 6 });
  await page.mouse.up();
}

const viewportOf = (page: Page) => page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform);

test("chuột phải Cảnh 3 → Chạy node này → chỉ Cảnh 3 và node phía trước có trạng thái mới", async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto("/");
  await page.getByTestId("template-sinh-ton-son-la").click();
  await expect(page).toHaveURL(/wf=sinh-ton-son-la-/);
  const wfId = new URL(page.url()).searchParams.get("wf")!;
  await expect(page.getByTestId("node-scene-g1-12")).toBeVisible();
  // Đổi mọi node sang dịch vụ giả qua API (không tốn Muse), rồi mở lại.
  const loaded = await readGraph(page, wfId);
  const fake = { ...loaded, nodes: loaded.nodes.map((n) => ("provider" in n.params ? { ...n, params: { ...n.params, provider: "fake" } } : n)) };
  expect((await page.request.put(`/api/workflows/${wfId}`, { data: { graph: fake } })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId("node-scene-g1-12")).toBeVisible();

  // Lần 1: chạy riêng Cảnh 2 (kéo theo Nhân vật, Không gian, Đồ vật làm node phía trước).
  await rightClick(page, "card-scene-g1-2");
  await expect(page.getByTestId("ctx-run-node")).toBeVisible();
  await expect(page.getByTestId("ctx-run-downstream")).toBeVisible();
  await page.getByTestId("ctx-run-node").click();
  await expect(page.getByTestId("context-menu")).toHaveCount(0);
  const first = await waitNewRun(page, wfId, undefined);
  await expect(page.getByTestId("node-status-scene-g1-2")).toHaveText("Xong");

  // Lần 2: chạy riêng Cảnh 3. Phạm vi lần chạy = Cảnh 3 + node phía trước, không có Cảnh 2, Cảnh 4, Ghép phim.
  await rightClick(page, "card-scene-g1-3");
  await page.getByTestId("ctx-run-node").click();
  const second = await waitNewRun(page, wfId, first);
  const inRun = await runNodes(page, second);
  expect(Object.keys(inRun).sort()).toEqual(["character-1", "location-1", "props-1", "scene-g1-3"]);
  expect(inRun["scene-g1-3"]!.status).toBe("succeeded");
  for (const id of ["character-1", "location-1", "props-1"]) expect(inRun[id]!.status, id).toBe("cached");

  // Trên canvas: Cảnh 3 và node phía trước có trạng thái mới; Cảnh 2 giữ trạng thái lần trước; node phía sau vẫn chưa chạy.
  await expect(page.getByTestId("node-status-scene-g1-3")).toHaveText("Xong");
  await expect(page.getByTestId("node-status-character-1")).toHaveText("Dùng lại kết quả");
  await expect(page.getByTestId("node-status-scene-g1-2")).toHaveText("Xong");
  await expect(page.getByTestId("node-status-scene-g1-4")).toHaveText("Chưa chạy");
  await expect(page.getByTestId("node-status-combine-g1")).toHaveText("Chưa chạy");
});

test("Chạy lại (bản mới) → take của Cảnh 3 = 2, dịch vụ giả gọi thêm 1 video", async ({ page }) => {
  test.setTimeout(300_000);
  const id = `chay-lai-${uid()}`;
  const scene = { size: "MS", angle: "eye", move: "static", subject: "character", start: "cô gái đứng bên suối, nhìn về phía lều", motion: "cô đi về phía lều", props: "", provider: "fake" };
  expect(
    (
      await page.request.put(`/api/workflows/${id}`, {
        data: {
          graph: {
            nodes: [
              { id: "c", type: "character", position: at(0, 0), params: { name: "Mai", description: "cô gái tóc đen buộc đuôi ngựa, áo khoác xám, dáng nhỏ nhắn", provider: "fake" } },
              { id: "l", type: "location", position: at(0, 400), params: { description: "bãi cỏ rộng bên suối đá, cây cối thưa, ánh nắng chiều xiên qua tán lá", provider: "fake" } },
              { id: "s", type: "scene", position: at(420, 100), params: scene },
            ],
            edges: [
              { id: "e1", source: "c", sourceHandle: "character", target: "s", targetHandle: "character" },
              { id: "e2", source: "l", sourceHandle: "location", target: "s", targetHandle: "location" },
            ],
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("card-s")).toBeVisible();

  // Lần 1: nút ▶ ngay trên thẻ chạy riêng Cảnh (cùng đường chạy với menu).
  await page.getByTestId("node-s").hover();
  await page.getByTestId("card-run-s").click();
  const first = await waitNewRun(page, id, undefined);
  expect(Object.keys(await runNodes(page, first)).sort()).toEqual(["c", "l", "s"]);
  await expect(page.getByTestId("node-status-s")).toHaveText("Xong");
  expect((await readGraph(page, id)).nodes.find((n) => n.id === "s")!.params.take).toBeUndefined();

  // Ước tính (cùng khoá cache với lần chạy thật): Cảnh vừa chạy xong là 0 lượt; cùng đồ thị nhưng take 2 thì thiếu cache đúng 1 clip.
  const estimateOf = async (wfId: string) => {
    const res = await page.request.post(`/api/workflows/${wfId}/estimate`, { data: { scope: { mode: "node", nodeId: "s" } } });
    expect(res.ok()).toBe(true);
    return ((await res.json()) as { nodes: { id: string; status: string; calls: { image: number; video: number; text: number } }[] }).nodes.find((n) => n.id === "s")!;
  };
  expect(await estimateOf(id)).toMatchObject({ status: "cached", calls: { video: 0 } });
  const saved = await readGraph(page, id);
  const twin = `${id}-take2`;
  const twinGraph = { ...saved, nodes: saved.nodes.map((n) => (n.id === "s" ? { ...n, params: { ...n.params, take: 2 } } : n)) };
  expect((await page.request.put(`/api/workflows/${twin}`, { data: { graph: twinGraph } })).ok()).toBe(true);
  const planned = await estimateOf(twin);
  expect(planned.status).toBe("run");
  expect(planned.calls.video).toBe(1);

  await rightClick(page, "card-s");
  await expect(page.getByTestId("ctx-rerun")).toBeVisible();
  await page.getByTestId("ctx-rerun").click();
  const second = await waitNewRun(page, id, first);

  // take tăng lên 2 và đã lưu; Cảnh chạy thật (không "Dùng lại kết quả") còn Nhân vật, Không gian dùng lại: chỉ Cảnh tốn thêm lượt.
  await expect.poll(async () => (await readGraph(page, id)).nodes.find((n) => n.id === "s")!.params.take).toBe(2);
  const nodes = await runNodes(page, second);
  expect(nodes.s!.status).toBe("succeeded");
  expect(nodes.c!.status).toBe("cached");
  expect(nodes.l!.status).toBe("cached");
  await expect(page.getByTestId("node-status-s")).toHaveText("Xong");
  await expect(page.getByTestId("node-status-c")).toHaveText("Dùng lại kết quả");
  // Giờ take 2 đã có kết quả: chạy node thường (không bản mới) dùng lại, không gọi thêm lần nào.
  expect(await estimateOf(id)).toMatchObject({ status: "cached", calls: { video: 0 } });
  await rightClick(page, "card-s");
  await page.getByTestId("ctx-run-node").click();
  const third = await waitNewRun(page, id, second);
  expect((await runNodes(page, third)).s!.status).toBe("cached");
  expect((await readGraph(page, id)).nodes.find((n) => n.id === "s")!.params.take).toBe(2);

  // Chạy lại (bản mới) lần nữa → take 3, lại chạy thật.
  await rightClick(page, "card-s");
  await page.getByTestId("ctx-rerun").click();
  const fourth = await waitNewRun(page, id, third);
  await expect.poll(async () => (await readGraph(page, id)).nodes.find((n) => n.id === "s")!.params.take).toBe(3);
  expect((await runNodes(page, fourth)).s!.status).toBe("succeeded");
});

test("Ctrl+D nhân bản node Prompt", async ({ page }) => {
  const id = `nhan-ban-${uid()}`;
  expect(
    (
      await page.request.put(`/api/workflows/${id}`, {
        data: {
          graph: {
            nodes: [
              { id: "p", type: "prompt", position: at(100, 80), params: { text: "Rừng sương sớm" } },
              { id: "v", type: "generate-video", position: at(500, 80), params: { provider: "fake", durationSec: 5 } },
            ],
            edges: [{ id: "e1", source: "p", sourceHandle: "text", target: "v", targetHandle: "prompt" }],
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("card-p")).toBeVisible();
  const prompts = () => page.locator('[data-testid^="node-prompt-"], [data-testid="node-p"]');

  // Menu chuột phải trên node Prompt: không có "Chạy lại" (Prompt không có take) và "Nhóm" (mới chọn một node).
  await rightClick(page, "card-p");
  for (const t of ["ctx-run-node", "ctx-run-downstream", "ctx-duplicate", "ctx-delete"]) await expect(page.getByTestId(t), t).toBeVisible();
  for (const t of ["ctx-rerun", "ctx-group"]) await expect(page.getByTestId(t), t).toHaveCount(0);
  await page.getByTestId("ctx-duplicate").click();
  await expect(prompts()).toHaveCount(2);
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  let graph = await readGraph(page, id);
  const copy1 = graph.nodes.find((n) => n.type === "prompt" && n.id !== "p")!;
  expect(copy1.position).toEqual({ x: 140, y: 120 });
  expect(copy1.params).toEqual({ text: "Rừng sương sớm" });
  expect(graph.edges).toHaveLength(1);
  // Bản sao là node duy nhất đang chọn; không kèm dây.
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
  expect(await page.locator(".react-flow__node.selected").getAttribute("data-id")).toBe(copy1.id);

  // Phím Ctrl+D nhân bản node đang chọn (bản sao vừa tạo), bản sao mới lại lệch 40px.
  await page.keyboard.press("Control+d");
  await expect(prompts()).toHaveCount(3);
  await expect.poll(async () => (await readGraph(page, id)).nodes.length).toBe(4);
  graph = await readGraph(page, id);
  const copy2 = graph.nodes.find((n) => n.type === "prompt" && n.id !== "p" && n.id !== copy1.id)!;
  expect(copy2.position).toEqual({ x: 180, y: 160 });
  expect(graph.edges).toHaveLength(1);
  expect(await page.locator(".react-flow__node.selected").getAttribute("data-id")).toBe(copy2.id);

  // Đang gõ trong ô nhập thì Ctrl+D không nhân bản.
  await page.getByTestId(`prompt-text-${copy2.id}`).click();
  await page.keyboard.press("Control+d");
  await expect(prompts()).toHaveCount(3);
});

test("menu chuột phải: chỗ trống chỉ có Thêm node + Vừa màn hình; Nhóm chỉ khi chọn ≥2; Xoá và phím Delete dọn cả dây; đóng bằng Esc, bấm ra ngoài; ? mở bảng phím tắt", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  const id = `menu-${uid()}`;
  expect(
    (
      await page.request.put(`/api/workflows/${id}`, {
        data: {
          graph: {
            nodes: [
              { id: "p1", type: "prompt", position: at(0, 0), params: { text: "một" } },
              { id: "p2", type: "prompt", position: at(0, 260), params: { text: "hai" } },
              { id: "p3", type: "prompt", position: at(0, 520), params: { text: "ba" } },
              { id: "v", type: "generate-video", position: at(500, 0), params: { provider: "fake", durationSec: 5 } },
            ],
            edges: [{ id: "e1", source: "p1", sourceHandle: "text", target: "v", targetHandle: "prompt" }],
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("card-p3")).toBeVisible();
  const empty = (await emptySpots(page))[0]!;

  // Chỗ trống: chỉ hai lệnh; mọi lệnh khác trong spec (dán, tự xếp...) không hiện.
  await page.mouse.click(empty.x, empty.y, { button: "right" });
  const menu = page.getByTestId("context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  await expect(page.getByTestId("ctx-add-here")).toBeVisible();
  await expect(page.getByTestId("ctx-fit")).toBeVisible();
  for (const t of ["ctx-run-node", "ctx-duplicate", "ctx-delete", "ctx-group", "ctx-rerun"]) await expect(page.getByTestId(t), t).toHaveCount(0);
  // Esc đóng menu.
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  // Bấm ra ngoài cũng đóng.
  await page.mouse.click(empty.x, empty.y, { button: "right" });
  await expect(menu).toBeVisible();
  await page.mouse.click((await emptySpots(page))[2]!.x, (await emptySpots(page))[2]!.y);
  await expect(menu).toHaveCount(0);

  // Thêm node ở đây: ô tìm mở ngay chỗ bấm, chọn Cảnh thì node mới nằm ở đó.
  await page.mouse.click(empty.x, empty.y, { button: "right" });
  await page.getByTestId("ctx-add-here").click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId("spotlight")).toBeVisible();
  await page.keyboard.type("cảnh");
  await page.getByTestId("spotlight-item-node-scene").click();
  const scene = page.locator('[data-testid^="node-scene-"]');
  await expect(scene).toHaveCount(1);
  await expect(scene).toBeVisible();
  const box = (await scene.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - empty.x)).toBeLessThan(60);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("inspector")).toHaveCount(0);

  // Vừa màn hình bằng phím F và bằng menu cho cùng một khung nhìn (cùng thông số với lúc mở workflow).
  await panCanvas(page);
  const panned = await viewportOf(page);
  await page.keyboard.press("f");
  await expect.poll(() => viewportOf(page)).not.toBe(panned);
  const fitted = await viewportOf(page);
  await panCanvas(page);
  await expect.poll(() => viewportOf(page)).not.toBe(fitted);
  const spot = (await emptySpots(page))[0]!;
  await page.mouse.click(spot.x, spot.y, { button: "right" });
  await page.getByTestId("ctx-fit").click();
  await expect.poll(() => viewportOf(page)).toBe(fitted);

  // Chọn hai node → chuột phải có "Nhóm" → nhóm tay hiện thành khung. Chọn một node thì không có "Nhóm".
  await page.getByTestId("card-p1").click();
  await page.getByTestId("card-p2").click({ modifiers: ["Control"] });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
  await rightClick(page, "card-p2");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
  await page.getByTestId("ctx-group").click();
  await expect(page.getByTestId("group-manual-1")).toBeVisible();
  await expect(page.getByTestId("context-menu")).toHaveCount(0);

  // Chuột phải node chưa chọn: chỉ chọn node đó; không có "Nhóm". Xoá bằng menu dọn node.
  await rightClick(page, "card-p3");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
  await expect(page.getByTestId("ctx-group")).toHaveCount(0);
  await page.getByTestId("ctx-delete").click();
  await expect(page.getByTestId("node-p3")).toHaveCount(0);

  // Phím Delete xoá node đang chọn và dây của nó (đường xoá chung với menu).
  await page.getByTestId("card-v").click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("node-v")).toHaveCount(0);
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect
    .poll(async () => {
      const g = await readGraph(page, id);
      return { nodes: g.nodes.map((n) => n.id).filter((n) => !n.startsWith("scene-")).sort(), edges: g.edges.length };
    })
    .toEqual({ nodes: ["p1", "p2"], edges: 0 });

  // Bảng phím tắt: ? mở, liệt kê đủ phím; Esc đóng.
  await page.mouse.click((await emptySpots(page))[2]!.x, (await emptySpots(page))[2]!.y);
  await page.keyboard.press("?");
  const sheet = page.getByTestId("shortcut-sheet");
  await expect(sheet).toBeVisible();
  for (const text of ["Ctrl+Enter", "Shift+Enter", "Ctrl+D", "Ctrl+G", "Delete", "Esc"]) await expect(sheet).toContainText(text);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("Chạy từ đây trở đi, Shift+Enter (node đang chọn), Ctrl+Enter (cả workflow): mỗi đường chạy đúng phạm vi của nó", async ({ page }) => {
  test.setTimeout(180_000);
  const id = `pham-vi-${uid()}`;
  expect(
    (
      await page.request.put(`/api/workflows/${id}`, {
        data: {
          graph: {
            nodes: [
              { id: "p", type: "prompt", position: at(0, 0), params: { text: "Rừng sương sớm, một con suối nhỏ" } },
              { id: "v", type: "generate-video", position: at(420, 0), params: { provider: "fake", durationSec: 5 } },
              { id: "q", type: "prompt", position: at(0, 300), params: { text: "Một chiếc lều bên suối" } },
            ],
            edges: [{ id: "e1", source: "p", sourceHandle: "text", target: "v", targetHandle: "prompt" }],
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("card-q")).toBeVisible();

  // Chạy từ đây trở đi trên Prompt p: p và Tạo video v phía sau, không có q.
  await rightClick(page, "card-p");
  await page.getByTestId("ctx-run-downstream").click();
  const first = await waitNewRun(page, id, undefined);
  expect(Object.keys(await runNodes(page, first)).sort()).toEqual(["p", "v"]);

  // Shift+Enter: chỉ node đang chọn (q). Phím tắt chạy cũng im khi giao diện còn bận (như nút Chạy bị khoá): đợi nhả.
  await expect(page.getByTestId("run-button")).toBeEnabled();
  await page.getByTestId("card-q").click();
  await page.keyboard.press("Shift+Enter");
  const second = await waitNewRun(page, id, first);
  expect(Object.keys(await runNodes(page, second))).toEqual(["q"]);

  // Ctrl+Enter: cả workflow. Đang gõ trong ô nhập thì không chạy.
  await expect(page.getByTestId("run-button")).toBeEnabled();
  await page.getByTestId("prompt-text-q").click();
  await page.keyboard.press("Control+Enter");
  await expect(page.getByTestId("run-button")).toBeEnabled();
  expect((await latestRun(page, id)).run!.id).toBe(second);
  await page.keyboard.press("Escape");
  await page.locator(".react-flow__pane").click({ position: { x: 700, y: 520 } });
  await page.keyboard.press("Control+Enter");
  const third = await waitNewRun(page, id, second);
  expect(Object.keys(await runNodes(page, third)).sort()).toEqual(["p", "q", "v"]);
});
