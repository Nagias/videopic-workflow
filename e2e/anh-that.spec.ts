import { expect, test, type Page } from "@playwright/test";
import { putWorkflow } from "./helpers";

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
  await expect.poll(async () => (await paramsOf(page, wf, "l")).photos).toEqual([]);
});
