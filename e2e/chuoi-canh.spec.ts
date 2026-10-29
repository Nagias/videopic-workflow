import { expect, test } from "@playwright/test";

const SCENES = Array.from({ length: 12 }, (_, i) => `scene-g1-${i + 1}`);

test("Luồng 2/4 — mẫu Sinh tồn Sơn La (12 node Cảnh + Ghép phim), chạy bằng dịch vụ giả: nhân vật 4 ảnh, đồ vật 9 ảnh, 12 cảnh Xong, phim ~60 giây", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.getByTestId("template-sinh-ton-son-la").click();
  await expect(page).toHaveURL(/wf=sinh-ton-son-la-/);
  await expect(page.getByTestId("workflow-select")).toContainText("Sinh tồn Sơn La");
  await expect(page.getByTestId("node-scene-g1-12")).toBeVisible();
  await expect(page.getByTestId("node-combine-g1")).toBeVisible();

  // Danh sách cảnh và Dựng phim đã thay bằng Cảnh + Ghép phim: không còn trong ô thêm node.
  const addNode = page.getByTestId("add-node");
  await expect(addNode.locator("option", { hasText: /^Cảnh$/ })).toHaveCount(1);
  await expect(addNode.locator("option", { hasText: "Ghép phim" })).toHaveCount(1);
  await expect(addNode.locator("option", { hasText: "Dựng phim" })).toHaveCount(0);
  await expect(addNode.locator("option", { hasText: "Danh sách cảnh" })).toHaveCount(0);

  for (const id of ["character-1", "location-1", "props-1"]) {
    await page.getByTestId(`provider-select-${id}`).selectOption("fake");
  }
  for (const id of SCENES) {
    await page.getByTestId(`scene-provider-${id}`).selectOption("fake");
  }
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");

  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("cancel-run")).toBeVisible();
  await expect(page.getByTestId("gallery-character-1").locator("img")).toHaveCount(4, { timeout: 60_000 });
  await expect(page.getByTestId("props-gallery-props-1").locator("img")).toHaveCount(9, { timeout: 60_000 });
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 240_000 });
  await expect(page.getByTestId("cancel-run")).toHaveCount(0);

  for (const id of SCENES) {
    await expect(page.getByTestId(`node-status-${id}`), id).toHaveText("Xong");
    await expect(page.getByTestId(`scene-clip-${id}`), id).toBeVisible();
  }
  const video = page.getByTestId("film-combine-video-combine-g1");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => (v.readyState >= 1 ? Math.round(v.duration) : 0)), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(59);
});
