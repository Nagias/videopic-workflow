import { expect, test } from "@playwright/test";
import { runAllConfirmed } from "./helpers";

test.describe("Luồng 1 — Prompt → Tạo video → xem clip (dịch vụ giả)", () => {
  test("gõ prompt, bấm Chạy, clip 5 giây hiện trong node; chạy lại thì dùng lại kết quả", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("card-prompt-1").click();
    const prompt = page.getByTestId("prompt-text-prompt-1");
    await expect(prompt).toBeVisible();

    await prompt.fill("A survival explorer walks through a misty primeval rainforest, handheld camera");
    await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");

    await runAllConfirmed(page);
    await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 45_000 });
    await expect(page.getByTestId("node-status-video-1")).toHaveText("Xong");

    await expect(page.getByTestId("card-video-1").locator("video")).toHaveCount(1);
    await page.getByTestId("card-video-1").click();
    const video = page.getByTestId("video-preview-video-1");
    await expect(video).toBeVisible();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => ({ ready: v.readyState >= 1, d: Math.round(v.duration), w: v.videoWidth })))
      .toEqual({ ready: true, d: 5, w: 1280 });

    await runAllConfirmed(page);
    await expect(page.getByTestId("run-status")).toHaveText("Chạy xong");
    await expect(page.getByTestId("node-status-video-1")).toHaveText("Dùng lại kết quả");
  });

  test("prompt trống: ước tính báo lỗi tiếng Việt ngay, không hiện hộp xác nhận, không chạy, không tạo clip", async ({ page }) => {
    let runRequests = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/runs$/.test(new URL(r.url()).pathname)) runRequests++;
    });
    await page.goto("/");
    await page.getByTestId("card-prompt-1").click();
    await page.getByTestId("prompt-text-prompt-1").fill("");
    await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
    await page.getByTestId("run-button").click();
    await expect(page.getByTestId("problem-banner")).toContainText("Prompt đang trống");
    await expect(page.getByTestId("run-confirm")).toHaveCount(0);
    await expect(page.getByTestId("run-button")).toBeEnabled();
    expect(runRequests).toBe(0);
  });

  test("chọn Muse khi chưa có tài khoản đăng nhập: báo cách đăng nhập, không treo", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("card-prompt-1").click();
    await page.getByTestId("prompt-text-prompt-1").fill("Product on a wooden table, slow orbit");
    await page.getByTestId("card-video-1").click();
    await page.getByTestId("provider-select-video-1").selectOption("muse");
    await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
    await runAllConfirmed(page);
    await expect(page.getByTestId("run-status")).toHaveText("Lỗi");
    await expect(page.getByTestId("node-error-video-1")).toContainText(/Test không được gọi Muse thật|npm run muse:login/);
  });
});
