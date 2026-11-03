import { expect, test, type Page } from "@playwright/test";
import { putWorkflow, runAllConfirmed } from "./helpers";

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const at = (x: number, y: number) => ({ x, y });

// Ảnh PNG 1×1 thật (đúng dấu hiệu đầu file, ffprobe đọc được).
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const png = (name: string) => ({ name, mimeType: "image/png", buffer: Buffer.from(PNG_1X1, "base64") });

type Saved = { graph: { nodes: { id: string; params: Record<string, unknown> }[] } };
const paramsOf = async (page: Page, wf: string, nodeId: string) =>
  ((await (await page.request.get(`/api/workflows/${wf}`)).json()) as Saved).graph.nodes.find((n) => n.id === nodeId)!.params;

test("Đồ vật: tải ảnh thật vào một trạng thái, đổi tên trạng thái thì ảnh thành 'chưa gắn', file không phải ảnh thì báo lỗi", async ({ page }) => {
  const wf = `anh-that-do-vat-${uid()}`;
  await putWorkflow(page, wf, {
    nodes: [
      {
        id: "pr",
        type: "props",
        position: at(0, 0),
        params: { name: "", items: [{ name: "Bàn gấp", description: "bàn dã ngoại gấp gọn mặt nhôm xám", states: "gấp phẳng, trong túi" }], provider: "fake" },
      },
    ],
    edges: [],
  });
  await page.goto(`/?wf=${wf}`);
  await page.getByTestId("card-pr").click();
  await expect(page.getByTestId("inspector")).toBeVisible();

  await page.getByTestId("prop-photo-drop-pr-1-1-input").setInputFiles(png("ban-gap.png"));
  await expect(page.getByTestId("prop-photo-pr-1-1-1")).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect.poll(async () => Object.keys(((await paramsOf(page, wf, "pr")).items as { photos?: object }[])[0]!.photos ?? {})).toEqual(["gấp phẳng"]);
  await expect(page.getByTestId("card-pr")).toContainText("1 ảnh thật · 1 ảnh vẽ");

  await page.getByTestId("prop-states-pr-1").fill("xếp gọn, trong túi");
  await expect(page.getByTestId("prop-photo-orphan-pr-1")).toBeVisible();
  await expect(page.getByTestId("prop-photo-pr-1-1-1")).toHaveCount(0);

  await page.getByTestId("prop-photo-drop-pr-1-2-input").setInputFiles({ name: "ghi-chu.txt", mimeType: "text/plain", buffer: Buffer.from("khong phai anh") });
  await expect(page.getByTestId("prop-photo-drop-pr-1-2-error")).toContainText("Chỉ nhận ảnh JPG, PNG hoặc WebP");

  await page.getByTestId("prop-photo-orphan-remove-pr-1").click();
  await expect(page.getByTestId("prop-photo-orphan-pr-1")).toHaveCount(0);
});

test("Đồ vật: thả ảnh vào hai trạng thái cùng lúc và gõ chữ trong lúc tải → giữ đủ cả hai ảnh và chữ vừa gõ", async ({ page }) => {
  const wf = `anh-that-cung-luc-${uid()}`;
  await putWorkflow(page, wf, {
    nodes: [
      { id: "pr", type: "props", position: at(0, 0), params: { name: "", items: [{ name: "Bàn gấp", description: "bàn dã ngoại gấp gọn", states: "gấp phẳng, có chân" }], provider: "fake" } },
    ],
    edges: [],
  });
  // Chậm câu trả lời tải ảnh để hai lượt tải và lúc gõ chữ chồng lên nhau thật.
  await page.route("**/api/media/upload", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.goto(`/?wf=${wf}`);
  await page.getByTestId("card-pr").click();
  const other = { ...png("chan.png"), buffer: Buffer.concat([Buffer.from(PNG_1X1, "base64"), Buffer.from([0])]) };
  await page.getByTestId("prop-photo-drop-pr-1-1-input").setInputFiles(png("phang.png"));
  await page.getByTestId("prop-photo-drop-pr-1-2-input").setInputFiles(other);
  await page.getByTestId("prop-desc-pr-1").fill("bàn dã ngoại gấp gọn, mặt nhôm xám, chân nâng hạ");
  await expect(page.getByTestId("prop-photo-pr-1-1-1")).toBeVisible();
  await expect(page.getByTestId("prop-photo-pr-1-2-1")).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await expect
    .poll(async () => {
      const row = ((await paramsOf(page, wf, "pr")).items as { description: string; photos?: Record<string, string[]> }[])[0]!;
      return [row.description, Object.keys(row.photos ?? {}).sort()];
    })
    .toEqual(["bàn dã ngoại gấp gọn, mặt nhôm xám, chân nâng hạ", ["có chân", "gấp phẳng"]]);
});

test("Không gian: tải 1 ảnh thật, xoá được, tham số lưu đúng", async ({ page }) => {
  const wf = `anh-that-khong-gian-${uid()}`;
  await putWorkflow(page, wf, {
    nodes: [{ id: "l", type: "location", position: at(0, 0), params: { description: "mặt hồ rộng giữa núi, nước xanh phẳng lặng", provider: "fake" } }],
    edges: [],
  });
  await page.goto(`/?wf=${wf}`);
  await page.getByTestId("card-l").click();
  await page.getByTestId("location-photo-drop-l-input").setInputFiles(png("ho.png"));
  await expect(page.getByTestId("location-photo-l-1")).toBeVisible();
  await expect.poll(async () => (await paramsOf(page, wf, "l")).photos).toHaveLength(1);

  await page.getByTestId("location-photo-remove-l-1").click();
  await expect(page.getByTestId("location-photo-l-1")).toHaveCount(0);
  await expect.poll(async () => "photos" in (await paramsOf(page, wf, "l"))).toBe(false);
});

test("luồng affiliate (dịch vụ giả): sản phẩm ảnh thật nối vào Biên kịch → mọi thẻ Cảnh tự có dây Sản phẩm, sản phẩm không tốn lượt vẽ, Ghép phim ra phim", async ({ page }) => {
  test.setTimeout(300_000);
  const upload = async (name: string) => {
    const res = await page.request.post("/api/media/upload", { headers: { "content-type": "image/png" }, data: Buffer.from(PNG_1X1, "base64") });
    expect(res.ok(), name).toBe(true);
    return ((await res.json()) as { mediaId: string }).mediaId;
  };
  const photo = await upload("ban-gap");
  const wf = `anh-that-luong-${uid()}`;
  await putWorkflow(page, wf, {
    nodes: [
      { id: "ch", type: "character", position: at(0, 0), params: { name: "Mai", description: "cô gái tóc ngắn, áo phao xanh ngọc, quần short vàng", provider: "fake" } },
      { id: "lo", type: "location", position: at(0, 300), params: { description: "mặt hồ rộng giữa núi, nước xanh phẳng lặng", photos: [photo], provider: "fake" } },
      {
        id: "sp",
        type: "props",
        position: at(0, 600),
        params: { name: "", items: [{ name: "Bàn gấp", description: "bàn dã ngoại gấp gọn mặt nhôm xám", states: "gấp phẳng", photos: { "gấp phẳng": [photo] } }], provider: "fake" },
      },
      { id: "w", type: "writer", position: at(400, 0), params: { idea: "Cô gái ngồi trên ván chèo giữa hồ giới thiệu bàn dã ngoại gấp gọn", shotCount: 4, provider: "fake" } },
      { id: "dp", type: "props", position: at(400, 600), params: { name: "", items: [], provider: "fake" } },
    ],
    edges: [
      { id: "e1", source: "ch", sourceHandle: "character", target: "w", targetHandle: "character" },
      { id: "e2", source: "lo", sourceHandle: "location", target: "w", targetHandle: "location" },
      { id: "e3", source: "sp", sourceHandle: "props", target: "w", targetHandle: "product" },
      { id: "e4", source: "w", sourceHandle: "props", target: "dp", targetHandle: "spec" },
    ],
  });
  await page.goto(`/?wf=${wf}`);
  await runAllConfirmed(page);
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 240_000 });
  // Biên kịch đã viết: bấm Tạo thẻ cảnh (nhóm mới lấy nguồn theo dây của Biên kịch), rồi chạy các cảnh.
  await page.getByTestId("card-w").click();
  await page.getByTestId("writer-expand-w").click();
  await expect(page.getByTestId("node-scene-g1-1")).toBeVisible();
  await runAllConfirmed(page);
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 240_000 });

  type Graph = { graph: { nodes: { id: string; type: string }[]; edges: { source: string; sourceHandle: string; target: string; targetHandle: string }[] } };
  const { graph } = (await (await page.request.get(`/api/workflows/${wf}`)).json()) as Graph;
  const scenes = graph.nodes.filter((n) => n.type === "scene").map((n) => n.id);
  expect(scenes.length).toBeGreaterThan(0);
  for (const id of scenes) expect(graph.edges.some((e) => e.source === "sp" && e.sourceHandle === "props" && e.target === id && e.targetHandle === "product"), id).toBe(true);

  await expect(page.getByTestId("card-sp")).toContainText("1 ảnh thật · 0 ảnh vẽ");
  const combine = graph.nodes.find((n) => n.type === "film-combine")!.id;
  await expect(page.getByTestId(`node-status-${combine}`)).toHaveText("Xong");
});
