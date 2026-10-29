import { expect, test, type Page } from "@playwright/test";

type SavedGraph = { graph: { nodes: { id: string; type: string }[]; edges: { source: string; sourceHandle: string; target: string; targetHandle: string }[] } };
const readGraph = async (page: Page, id: string) => ((await (await page.request.get(`/api/workflows/${id}`)).json()) as SavedGraph).graph;

const centerOf = async (page: Page, testid: string) => {
  const box = await page.getByTestId(testid).boundingBox();
  if (!box) throw new Error(`Không thấy ${testid}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

test("phím / → gõ 'cảnh' → Enter → có node Cảnh giữa màn hình, được chọn", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("card-prompt-1")).toBeVisible();
  await expect(page.locator('[data-testid^="node-scene-"]')).toHaveCount(0);

  // Khung bên phải mở ra sau khi chọn node và thu hẹp canvas: đo tâm vùng nhìn từ trước.
  const canvas = await page.locator(".canvas").boundingBox();
  if (!canvas) throw new Error("Không đo được canvas");
  await page.keyboard.press("/");
  await expect(page.getByTestId("spotlight")).toBeVisible();
  await expect(page.getByTestId("spotlight-input")).toBeFocused();
  await page.keyboard.type("cảnh");
  await expect(page.getByTestId("spotlight-item-node-scene")).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("spotlight")).toHaveCount(0);
  const scene = page.locator('[data-testid^="node-scene-"]');
  await expect(scene).toHaveCount(1);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
  await expect(page.getByTestId("inspector")).toBeVisible();
  const box = await scene.boundingBox();
  if (!box) throw new Error("Không đo được node Cảnh");
  const mid = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
  expect(Math.abs(box.x + box.width / 2 - mid.x)).toBeLessThan(40);
  expect(box.y).toBeLessThan(mid.y);
  expect(box.y + box.height).toBeGreaterThan(mid.y);
});

test("Space và nút + mở ô tìm; ↑↓ chọn, Esc đóng; đang gõ trong ô nhập thì / và Space chỉ là chữ", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("card-prompt-1").click();
  const text = page.getByTestId("prompt-text-prompt-1");
  await text.fill("");
  await text.press("/");
  await text.press("Space");
  await text.pressSequentially("a");
  await expect(text).toHaveValue("/ a");
  await expect(page.getByTestId("spotlight")).toHaveCount(0);

  await page.getByTestId("rail-add").click();
  await expect(page.getByTestId("spotlight")).toBeVisible();
  await expect(page.getByTestId("spotlight-input")).toBeFocused();
  // Đang gõ trong chính ô tìm: Space là chữ, ô không đóng.
  await page.keyboard.type("ghép phim");
  await expect(page.getByTestId("spotlight-input")).toHaveValue("ghép phim");
  await expect(page.getByTestId("spotlight-item-node-film-combine")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("spotlight")).toHaveCount(0);

  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 500 } });
  await page.keyboard.press("Space");
  await expect(page.getByTestId("spotlight")).toBeVisible();
  // Chưa chọn gì lần nào: mặc định nhóm Cơ bản, chưa có nhóm Gần đây. Sang nhóm Tạo video: ↓ rồi Enter chọn mục thứ hai (Cảnh).
  await expect(page.getByTestId("spotlight-cat-gan-day")).toHaveCount(0);
  await page.getByTestId("spotlight-cat-tao-video").click();
  await expect(page.locator('[data-testid^="spotlight-item-"]')).toHaveCount(2);
  await expect(page.getByTestId("spotlight-input")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("spotlight")).toHaveCount(0);
  await expect(page.locator('[data-testid^="node-scene-"]')).toHaveCount(1);
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");

  // Lần sau mở ô: mục vừa chọn nằm ở nhóm Gần đây (nhớ trong localStorage), và là nhóm mở sẵn.
  await page.keyboard.press("/");
  await expect(page.getByTestId("spotlight-cat-gan-day")).toBeVisible();
  await expect(page.getByTestId("spotlight-item-node-scene")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("videopic.spotlight.recent"))).toBe('["node-scene"]');
  // Giá trị hỏng trong localStorage: ô vẫn mở được, danh sách gần đây rỗng.
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.localStorage.setItem("videopic.spotlight.recent", "{khong-phai-json"));
  await page.keyboard.press("/");
  await expect(page.getByTestId("spotlight")).toBeVisible();
  await expect(page.getByTestId("spotlight-cat-gan-day")).toHaveCount(0);
});

test("kéo từ cổng Clip của Cảnh 12 ra chỗ trống → ô tìm chỉ có node nhận Video → chọn Ghép phim → node mới ở chỗ thả, có dây", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto("/");
  await page.getByTestId("template-sinh-ton-son-la").click();
  await expect(page).toHaveURL(/wf=sinh-ton-son-la-/);
  const wfId = new URL(page.url()).searchParams.get("wf")!;
  await expect(page.getByTestId("node-scene-g1-12")).toBeVisible();
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(500);

  const combineIds = () => page.locator('[data-testid^="node-film-combine-"], [data-testid="node-film-combine"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!));
  const before = await combineIds();
  const edgesBefore = await page.locator(".react-flow__edge").count();
  const from = await page.locator('[data-testid="node-scene-g1-12"] .react-flow__handle.source[data-handleid="clip"]').boundingBox();
  if (!from) throw new Error("Không thấy cổng Clip của Cảnh 12");

  // Tìm điểm trống gần cổng nhất: ngoài mọi thẻ, khung nhóm và nút điều khiển, và đúng nền canvas.
  const drop = await page.evaluate(
    ({ fromX, fromY }) => {
      const canvas = document.querySelector(".canvas")!.getBoundingClientRect();
      const blocked = [...document.querySelectorAll(".react-flow__node, .react-flow__controls")].map((e) => e.getBoundingClientRect());
      let best: { x: number; y: number; d: number } | null = null;
      for (let y = canvas.top + 80; y < canvas.bottom - 200; y += 40) {
        for (let x = canvas.left + 100; x < canvas.right - 100; x += 40) {
          const free = blocked.every((r) => x < r.left - 60 || x > r.right + 60 || y < r.top - 60 || y > r.bottom + 60);
          if (!free || !document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) continue;
          const d = Math.hypot(x - fromX, y - fromY);
          if (!best || d < best.d) best = { x, y, d };
        }
      }
      return best;
    },
    { fromX: from.x + from.width / 2, fromY: from.y + from.height / 2 },
  );
  if (!drop) throw new Error("Không tìm được chỗ trống để thả dây");

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 14 });
  await page.mouse.up();

  await expect(page.getByTestId("spotlight")).toBeVisible();
  await expect(page.getByTestId("spotlight-filter")).toContainText("Video");
  const items = await page.locator('[data-testid^="spotlight-item-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!).sort());
  expect(items).toEqual(["spotlight-item-node-film-combine", "spotlight-item-node-scene"]);

  await page.getByTestId("spotlight-item-node-film-combine").click();
  await expect(page.getByTestId("spotlight")).toHaveCount(0);
  await expect.poll(async () => (await combineIds()).length).toBe(before.length + 1);
  const created = (await combineIds()).find((t) => !before.includes(t))!;
  const box = (await centerOf(page, created)).box;
  // Cổng vào nằm bên trái thẻ: mép trái thẻ ở ngay chỗ thả, và chỗ thả nằm trong chiều cao thẻ.
  expect(box.x).toBeGreaterThan(drop.x - 20);
  expect(box.x).toBeLessThan(drop.x + 80);
  expect(box.y).toBeLessThan(drop.y);
  expect(box.y + box.height).toBeGreaterThan(drop.y);

  await expect(page.locator(".react-flow__edge")).toHaveCount(edgesBefore + 1);
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  const newId = created.replace(/^node-/, "");
  await expect
    .poll(async () => (await readGraph(page, wfId)).edges.filter((e) => e.source === "scene-g1-12" && e.target === newId).map((e) => `${e.sourceHandle}->${e.targetHandle}`))
    .toEqual(["clip->clips"]);
  expect((await readGraph(page, wfId)).nodes.some((n) => n.id === newId && n.type === "film-combine")).toBe(true);
});

test("kéo từ cổng vào Nối tiếp ra chỗ trống → chỉ có node ra Video → chọn Cảnh thì dây đi từ Cảnh mới vào cổng đó, thay dây cũ", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto("/");
  await page.getByTestId("template-sinh-ton-son-la").click();
  await expect(page).toHaveURL(/wf=sinh-ton-son-la-/);
  const wfId = new URL(page.url()).searchParams.get("wf")!;
  await expect(page.getByTestId("node-scene-g1-6")).toBeVisible();
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(500);

  const start = await readGraph(page, wfId);
  const old = start.edges.find((e) => e.target === "scene-g1-6" && e.targetHandle === "follow");
  expect(old, "Cảnh 6 phải đang nối tiếp một cảnh").toBeTruthy();

  const handle = await page.locator('[data-testid="node-scene-g1-6"] .react-flow__handle.target[data-handleid="follow"]').boundingBox();
  if (!handle) throw new Error("Không thấy cổng Nối tiếp của Cảnh 6");
  const canvas = await page.locator(".canvas").boundingBox();
  if (!canvas) throw new Error("Không đo được canvas");
  const drop = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height - 120 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? "", drop)).toContain("react-flow__pane");

  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 14 });
  await page.mouse.up();

  await expect(page.getByTestId("spotlight-filter")).toContainText("Video");
  await page.getByTestId("spotlight-input").fill("cảnh");
  await page.getByTestId("spotlight-item-node-scene").click();
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect
    .poll(async () => {
      const g = await readGraph(page, wfId);
      const into = g.edges.filter((e) => e.target === "scene-g1-6" && e.targetHandle === "follow");
      return into.length === 1 && into[0]!.source !== old!.source && into[0]!.sourceHandle === "clip" && g.nodes.some((n) => n.id === into[0]!.source && n.type === "scene");
    })
    .toBe(true);
});

test("kéo từ cổng Không gian của Hồ sơ không gian ra chỗ trống → chọn Cảnh → dây vào cổng `location`, không phải `character`", async ({ page }) => {
  const id = `loc-${Date.now().toString(36)}`;
  const put = await page.request.put(`/api/workflows/${id}`, {
    data: { graph: { nodes: [
          { id: "loc", type: "location", position: { x: 0, y: 0 }, params: { name: "", description: "", provider: "fake" } },
          // Node thứ hai ở xa để canvas vừa màn hình ở mức thu nhỏ, chừa khoảng trống giữa hai node để thả dây.
          { id: "p", type: "prompt", position: { x: 1100, y: 0 }, params: { text: "x" } },
        ],
        edges: [],
      },
    },
  });
  expect(put.ok()).toBe(true);
  await page.goto(`/?wf=${id}`);
  await expect(page.getByTestId("node-loc")).toBeVisible();
  // Vừa mở, canvas còn đang tự vừa màn hình: đợi nó đứng yên rồi mới đo cổng.
  await page.waitForTimeout(800);
  const from = await page.locator('[data-testid="node-loc"] .react-flow__handle.source[data-handleid="location"]').boundingBox();
  const next = await page.getByTestId("node-p").boundingBox();
  if (!from || !next) throw new Error("Không thấy cổng Không gian hoặc node Prompt");
  const drop = { x: (from.x + next.x) / 2, y: from.y + from.height / 2 };
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByTestId("spotlight-filter")).toContainText("Bộ ảnh");
  await expect(page.getByTestId("spotlight-item-node-scene")).toContainText("vào cổng «Không gian»");
  await page.getByTestId("spotlight-item-node-scene").click();
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect
    .poll(async () => (await readGraph(page, id)).edges.map((e) => `${e.source}.${e.sourceHandle}->${e.targetHandle}`))
    .toEqual(["loc.location->location"]);
  const g = await readGraph(page, id);
  expect(g.nodes.find((n) => n.id === g.edges[0]!.target)?.type).toBe("scene");
});

test("bấm vào cổng không kéo, hay thả dây lên thân thẻ khác: không mở ô tìm", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("node-video-1")).toBeVisible();
  const out = await page.locator('[data-testid="node-prompt-1"] .react-flow__handle.source[data-handleid="text"]').boundingBox();
  const body = await page.getByTestId("node-video-1").boundingBox();
  if (!out || !body) throw new Error("Không thấy cổng hoặc thẻ Tạo video");
  await page.mouse.click(out.x + out.width / 2, out.y + out.height / 2);
  await expect(page.getByTestId("spotlight")).toHaveCount(0);
  await page.mouse.move(out.x + out.width / 2, out.y + out.height / 2);
  await page.mouse.down();
  await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId("spotlight")).toHaveCount(0);
});
