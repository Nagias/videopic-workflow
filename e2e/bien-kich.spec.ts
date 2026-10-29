import { expect, test, type Page } from "@playwright/test";

const duration = (page: Page, id: string) =>
  page.getByTestId(`film-combine-video-${id}`).evaluate((v: HTMLVideoElement) => (v.readyState >= 1 ? Math.round(v.duration) : 0));

test("Luồng 3/4 — mẫu Ý tưởng → phim: Biên kịch (giả) viết 8 cảnh, nhóm Phân cảnh tự có thẻ cảnh; đổi ý tưởng thì nhóm tạo lại không cần tải lại trang; sửa tay thẻ cảnh thì hỏi Thay/Giữ; nhân vật chọn lại được từ kho", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/");
  await page.getByTestId("template-y-tuong-thanh-phim").click();
  await expect(page).toHaveURL(/wf=y-tuong-thanh-phim-/);
  // Biên kịch chưa có kết quả: chưa tạo thẻ cảnh được.
  await expect(page.getByTestId("writer-expand-writer-1")).toBeDisabled();
  await expect(page.getByTestId("node-scene-g1-1")).toHaveCount(0);
  for (const id of ["character-1", "location-1", "writer-1", "props-1"]) {
    await page.getByTestId(`provider-select-${id}`).selectOption("fake");
  }
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");

  // Lần 1: Biên kịch viết xong thì máy chủ tạo 8 thẻ cảnh trong lúc chạy; giao diện tải lại đồ thị ngay lúc đó (chưa hết
  // lần chạy), không chờ chạy xong — trạng thái lần chạy đọc cùng lúc thẻ cảnh xuất hiện, trong trang.
  await page.getByTestId("run-button").click();
  const statusWhenCardsAppear = await page.waitForFunction(
    () => (document.querySelector('[data-testid="node-scene-g1-8"]') ? (document.querySelector('[data-testid="run-status"]')?.textContent ?? "") : false),
    undefined,
    { timeout: 120_000 },
  );
  expect(await statusWhenCardsAppear.jsonValue()).toBe("Đang chạy…");
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 240_000 });
  await expect(page.getByTestId("writer-result-writer-1").locator("li")).toHaveCount(8);
  await expect(page.getByTestId("props-gallery-props-1").locator("img")).toHaveCount(2);
  await expect(page.getByTestId("node-scene-g1-8")).toBeVisible();
  await expect(page.getByTestId("node-scene-g1-9")).toHaveCount(0);
  for (let n = 1; n <= 8; n++) await expect(page.getByTestId(`node-status-scene-g1-${n}`)).toHaveText("Xong");
  await expect.poll(() => duration(page, "combine-g1"), { timeout: 20_000 }).toBeGreaterThanOrEqual(39);
  await expect(page.getByTestId("writer-expand-writer-1")).toBeEnabled();

  // Lần 2: đổi ý tưởng và số cảnh → nhóm tạo lại thành 10 thẻ, hiện ngay sau khi chạy xong.
  await page.getByTestId("writer-idea-writer-1").fill("Cô gái leo lên đỉnh đồi ngắm mây rồi dựng lều, nhóm bếp nấu nước.");
  await page.getByTestId("writer-count-writer-1").fill("10");
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 240_000 });
  await expect(page.getByTestId("writer-result-writer-1").locator("li")).toHaveCount(10);
  await expect(page.getByTestId("node-scene-g1-10")).toBeVisible();
  await expect(page.getByTestId("node-status-scene-g1-10")).toHaveText("Xong");
  await expect(page.getByTestId("scenes-decision")).toHaveCount(0);
  await expect.poll(() => duration(page, "combine-g1"), { timeout: 20_000 }).toBeGreaterThanOrEqual(49);

  // Lần 3: sửa tay một thẻ cảnh rồi đổi ý tưởng → lần chạy dừng hỏi; chọn Giữ thì thẻ đã sửa còn nguyên, chạy lại xong.
  const edited = "cô đứng yên bên suối, gió thổi nhẹ tóc (sửa tay)";
  await page.getByTestId("scene-motion-scene-g1-3").fill(edited);
  await page.getByTestId("writer-idea-writer-1").fill("Cô gái đi dọc bờ suối tìm củi khô rồi nhóm lửa trước lều.");
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("scenes-decision")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("run-status")).toHaveText("Lỗi");
  await expect(page.getByTestId("problem-banner")).toContainText("thẻ cảnh đã được sửa tay");
  await page.getByTestId("scenes-keep").click();
  await expect(page.getByTestId("scenes-decision")).toHaveCount(0);
  await expect(page.getByTestId("scene-motion-scene-g1-3")).toHaveValue(edited);
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 240_000 });
  await expect(page.getByTestId("scenes-decision")).toHaveCount(0);
  await expect(page.getByTestId("scene-motion-scene-g1-3")).toHaveValue(edited);

  // Nút Tạo thẻ cảnh: thay nhóm bằng bộ cảnh của Biên kịch (bỏ phần sửa tay).
  await page.getByTestId("writer-expand-writer-1").click();
  await expect(page.getByTestId("scene-motion-scene-g1-3")).toHaveValue("việc xảy ra ở cảnh 3");
  await expect(page.getByTestId("node-scene-g1-10")).toBeVisible();

  const description = await page.getByTestId("character-text-character-1").inputValue();
  await page.getByTestId("template-sinh-ton-son-la").click();
  await expect(page).toHaveURL(/wf=sinh-ton-son-la-/);
  await page.getByTestId("character-text-character-1").fill("mô tả tạm sẽ bị thay bằng nhân vật lấy từ kho");
  await expect(page.getByTestId("asset-pick-character-1").locator("option", { hasText: "Cô gái Sơn La" })).toHaveCount(1);
  await page.getByTestId("asset-pick-character-1").selectOption({ label: "Cô gái Sơn La" });
  await expect(page.getByTestId("character-text-character-1")).toHaveValue(description);
});
