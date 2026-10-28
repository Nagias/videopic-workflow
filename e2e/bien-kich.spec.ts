import { expect, test } from "@playwright/test";

test("Luồng 3 — mẫu Ý tưởng → phim: Biên kịch (giả) viết 8 cảnh + đồ vật, Đồ vật nhận danh sách từ Biên kịch, ra phim; nhân vật chọn lại được từ kho ở workflow khác", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.getByTestId("template-y-tuong-thanh-phim").click();
  await expect(page).toHaveURL(/wf=y-tuong-thanh-phim-/);
  for (const id of ["character-1", "location-1", "writer-1", "props-1", "film-1"]) {
    await page.getByTestId(`provider-select-${id}`).selectOption("fake");
  }
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");

  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 240_000 });
  await expect(page.getByTestId("writer-result-writer-1").locator("li")).toHaveCount(8);
  await expect(page.getByTestId("props-gallery-props-1").locator("img")).toHaveCount(2);
  await expect(page.getByTestId("storyboard-film-1").locator(".sb-done")).toHaveCount(8);
  const video = page.getByTestId("video-preview-film-1");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => (v.readyState >= 1 ? Math.round(v.duration) : 0)), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(39);

  const description = await page.getByTestId("character-text-character-1").inputValue();
  await page.getByTestId("template-sinh-ton-son-la").click();
  await expect(page).toHaveURL(/wf=sinh-ton-son-la-/);
  await page.getByTestId("character-text-character-1").fill("mô tả tạm sẽ bị thay bằng nhân vật lấy từ kho");
  await expect(page.getByTestId("asset-pick-character-1").locator("option", { hasText: "Cô gái Sơn La" })).toHaveCount(1);
  await page.getByTestId("asset-pick-character-1").selectOption({ label: "Cô gái Sơn La" });
  await expect(page.getByTestId("character-text-character-1")).toHaveValue(description);
});
