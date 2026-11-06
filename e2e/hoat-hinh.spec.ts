import { expect, test, type Page } from "@playwright/test";
import { runAllConfirmed } from "./helpers";

const duration = (page: Page, id: string) =>
  page.getByTestId(`film-combine-video-${id}`).evaluate((v: HTMLVideoElement) => (v.readyState >= 1 ? Math.round(v.duration) : 0));

// Chạy riêng một node (chọn thẻ rồi Shift+Enter = "Chạy node này"); hộp xác nhận (nếu hiện) thì đồng ý.
async function runNode(page: Page, id: string): Promise<void> {
  await page.getByTestId(`card-${id}`).click();
  await page.keyboard.press("Shift+Enter");
  const confirm = page.getByTestId("run-confirm-ok");
  if (await confirm.waitFor({ timeout: 3_000 }).then(() => true, () => false)) await confirm.click();
  await expect(page.getByTestId(`node-status-${id}`)).toHaveText(/Xong|Dùng lại kết quả/, { timeout: 60_000 });
}

test("Luồng 9 — mẫu Phim hoạt hình: duyệt từng bước (3 ý tưởng → chọn ý 2 → dàn ý → Biên kịch theo đợt) rồi chạy cả ra phim; thẻ cảnh có ai trong khung và cuối cảnh", async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto("/");
  await page.getByTestId("template-hoat-hinh-3-phut").click();
  await expect(page).toHaveURL(/wf=hoat-hinh-3-phut-/);
  for (const id of ["cast-1", "location-1", "ideas-1", "outline-1", "writer-1", "props-1"]) {
    await page.getByTestId(`card-${id}`).click();
    await page.getByTestId(`provider-select-${id}`).selectOption("fake");
  }
  // Dàn nhân vật: đủ 4 nhân vật có kích thước; Không gian cùng phong cách hoạt hình.
  await page.getByTestId("card-cast-1").click();
  await expect(page.getByTestId("cast-member-size-cast-1-3")).toHaveValue(/cao 6 cm/);
  await expect(page.getByTestId("cast-style-cast-1")).toHaveValue("hoat-hinh-2d");
  await page.getByTestId("card-location-1").click();
  await expect(page.getByTestId("location-style-location-1")).toHaveValue("hoat-hinh-2d");
  // Tập ngắn cho test: 12 cảnh.
  await page.getByTestId("card-outline-1").click();
  await page.getByTestId("outline-count-outline-1").fill("12");
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");

  // Bước 1: đạo diễn AI đề xuất 3 ý tưởng; chọn ý 2.
  await runNode(page, "ideas-1");
  await page.getByTestId("card-ideas-1").click();
  await expect(page.getByTestId("ideas-result-ideas-1").locator("input[type=radio]")).toHaveCount(3);
  await page.getByTestId("ideas-pick-ideas-1-2").check();
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");

  // Bước 2: dàn ý theo ý 2, đủ 3 phần.
  await runNode(page, "outline-1");
  await page.getByTestId("card-outline-1").click();
  await expect(page.getByTestId("outline-result-outline-1")).toContainText("Phần 1 · Gây chuyện");
  await expect(page.getByTestId("outline-result-outline-1")).toContainText("Phần 3 · Chốt");

  // Bước 3: Biên kịch nối Dàn ý (ẩn ô ý tưởng), rồi chạy cả: 12 thẻ cảnh tự sinh, ra phim ~60 giây.
  await page.getByTestId("card-writer-1").click();
  await expect(page.getByTestId("writer-from-outline-writer-1")).toBeVisible();
  await expect(page.getByTestId("writer-idea-writer-1")).toHaveCount(0);
  await runAllConfirmed(page);
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 300_000 });
  await expect(page.getByTestId("node-scene-g1-12")).toBeVisible();
  await expect(page.getByTestId("node-scene-g1-13")).toHaveCount(0);
  await page.getByTestId("card-writer-1").click();
  await expect(page.getByTestId("writer-result-writer-1").locator("li")).toHaveCount(12);
  await expect(page.getByTestId("writer-result-writer-1")).toContainText("Cuối cảnh:");
  await page.getByTestId("card-scene-g1-2").click();
  await expect(page.getByTestId("scene-cast-scene-g1-2")).not.toHaveValue("");
  await expect(page.getByTestId("scene-end-scene-g1-2")).not.toHaveValue("");
  await page.getByTestId("card-combine-g1").click();
  await expect.poll(() => duration(page, "combine-g1"), { timeout: 20_000 }).toBeGreaterThanOrEqual(58);
});
