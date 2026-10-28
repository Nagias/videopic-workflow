import { expect, test } from "@playwright/test";

test("Luồng 2 — tạo từ mẫu Sinh tồn Sơn La, chạy bằng dịch vụ giả, ra phim ~60 giây với storyboard 12 cảnh", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await page.getByTestId("template-sinh-ton-son-la").click();
  await expect(page).toHaveURL(/wf=sinh-ton-son-la-/);
  await expect(page.getByTestId("shot-row-shotlist-1-12")).toBeVisible();
  await expect(page.getByTestId("workflow-select")).toContainText("Sinh tồn Sơn La");

  for (const id of ["character-1", "location-1", "film-1"]) {
    await page.getByTestId(`provider-select-${id}`).selectOption("fake");
  }
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");

  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("gallery-character-1").locator("img")).toHaveCount(3, { timeout: 60_000 });
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 200_000 });

  const shots = page.getByTestId("storyboard-film-1").locator(".sb-done");
  await expect(shots).toHaveCount(12);
  const video = page.getByTestId("video-preview-film-1");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => (v.readyState >= 1 ? Math.round(v.duration) : 0)), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(59);
});
