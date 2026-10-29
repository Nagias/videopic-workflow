import { expect, test, type Page } from "@playwright/test";
import { expandScenes } from "../src/shared/scenes";
import { SON_LA_SHOTS } from "../src/shared/templates";
import type { WorkflowGraph } from "../src/shared/workflow";
import { findEmptyPane, runAllConfirmed, useFakeSonLa } from "./helpers";

// Đo độ mượt của canvas: workflow ~30 node (2 nhóm Phân cảnh x 12 cảnh, đã chạy bằng dịch vụ giả nên thẻ có ảnh), kéo nền 20 bước
// và cuộn phóng to/thu nhỏ 10 bước. Mỗi bước đo từ lúc sự kiện chuột tới tay trang đến lúc khung hình thứ hai sau đó được vẽ
// (hai lần requestAnimationFrame), nên mốc rảnh rỗi trên màn hình 60 Hz là 17-33 ms; ngưỡng 50 ms là còn đủ mượt.
// Chỉ chạy khi đặt PERF=1 (đo thời gian phụ thuộc máy, không đưa vào verify:full và CI): PERF=1 npx playwright test e2e/hieu-nang.spec.ts

const THRESHOLD_MS = 50;
// Một bước đơn lẻ (vd khung hình qua ngưỡng thu nhỏ) được chậm hơn trung bình, nhưng quá ngần này là giật thấy rõ.
const MAX_STEP_MS = 250;
// Ngưỡng thu nhỏ của thẻ (COMPACT_ZOOM ở src/features/editor/ui/NodeCard.tsx, file đó kéo theo React nên không import vào đây):
// lượt cuộn phải đi qua ngưỡng này để đo cả khung hình thẻ đổi chế độ.
const COMPACT_ZOOM = 0.45;
const DRAG_STEPS = 20;
const ZOOM_STEPS = 10;

type Stats = { avg: number; max: number; n: number };
const stats = (xs: number[]): Stats => ({ avg: xs.reduce((a, b) => a + b, 0) / xs.length, max: Math.max(...xs), n: xs.length });
const fmt = (s: Stats) => `trung bình ${s.avg.toFixed(1)} ms, lớn nhất ${s.max.toFixed(1)} ms (${s.n} bước)`;

// Từ giờ, mỗi pointermove / wheel tới trang ghi một mẫu: thời gian tới khung hình thứ hai sau sự kiện.
async function installProbe(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __perf: { pointer: number[]; wheel: number[] } };
    w.__perf = { pointer: [], wheel: [] };
    const probe = (kind: "pointer" | "wheel") => () => {
      const t0 = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => w.__perf[kind].push(performance.now() - t0)));
    };
    window.addEventListener("pointermove", probe("pointer"), true);
    window.addEventListener("wheel", probe("wheel"), true);
  });
}

const nextFrames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const zoomOf = (page: Page) => page.evaluate(() => Number(/scale\(([\d.]+)\)/.exec(document.querySelector<HTMLElement>(".react-flow__viewport")!.style.transform)?.[1] ?? "NaN"));

test("hiệu năng canvas ~30 node: kéo nền và cuộn phóng to trung bình dưới 50 ms mỗi bước", async ({ page }) => {
  test.skip(!process.env.PERF, "Chỉ chạy khi đặt PERF=1 (đo thời gian phụ thuộc máy)");
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto("/");
  await page.getByTestId("template-sinh-ton-son-la").click();
  await expect(page).toHaveURL(/wf=sinh-ton-son-la-/);
  const wfId = new URL(page.url()).searchParams.get("wf")!;
  await expect(page.getByTestId("node-scene-g1-12")).toBeVisible();

  // Dịch vụ giả với kết quả riêng của spec này, rồi thêm nhóm thứ hai 12 cảnh (cùng Nhân vật/Không gian/Đồ vật) bằng chính hàm máy chủ dùng để tạo thẻ cảnh.
  await useFakeSonLa(page, wfId);
  const loaded = (await (await page.request.get(`/api/workflows/${wfId}`)).json()) as { graph: WorkflowGraph };
  const second = expandScenes(loaded.graph, {
    groupId: "g2",
    shots: SON_LA_SHOTS.map((s) => ({ ...s, motion: `${s.motion} (nhóm 2)` })),
    refs: { character: "character-1", location: "location-1", props: "props-1" },
    provider: "fake",
    origin: { x: 480, y: 760 },
  }).graph;
  expect((await page.request.put(`/api/workflows/${wfId}`, { data: { graph: second } })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId("node-scene-g2-12")).toBeVisible();
  const nodeCount = await page.locator(".react-flow__node:not(.react-flow__node-group-frame)").count();
  expect(nodeCount).toBeGreaterThanOrEqual(29);

  await runAllConfirmed(page);
  await expect(page.getByTestId("run-status")).toHaveText("Chạy xong", { timeout: 480_000 });
  await page.reload();
  await expect(page.getByTestId("node-scene-g2-12")).toBeVisible();
  await expect(page.getByTestId("node-status-scene-g2-12")).toHaveText(/Xong|Dùng lại/);
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(800);

  const spot = await findEmptyPane(page);
  await page.mouse.move(spot.x, spot.y);
  // Khởi động trước khi đo: vài bước kéo và cuộn bỏ đi (lần đầu trình duyệt còn biên dịch, giải mã ảnh).
  await page.mouse.down();
  for (let i = 0; i < 4; i++) await page.mouse.move(spot.x + (i % 2 ? -6 : 6), spot.y + 3, { steps: 1 });
  await page.mouse.up();
  await page.mouse.wheel(0, 120);
  await page.mouse.wheel(0, -120);
  await nextFrames(page);
  await installProbe(page);

  const zoomStart = await zoomOf(page);
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  for (let i = 1; i <= DRAG_STEPS; i++) {
    await page.mouse.move(spot.x + (i % 2 ? 1 : -1) * 4 * i, spot.y + 3 * i, { steps: 1 });
    await nextFrames(page);
  }
  await page.mouse.up();
  await nextFrames(page);

  await page.mouse.move(spot.x, spot.y);
  let zoomLow = zoomStart;
  for (let i = 0; i < ZOOM_STEPS; i++) {
    await page.mouse.wheel(0, i < ZOOM_STEPS / 2 ? 120 : -120);
    await nextFrames(page);
    zoomLow = Math.min(zoomLow, await zoomOf(page));
  }
  const zoomEnd = await zoomOf(page);

  const perf = await page.evaluate(() => (window as unknown as { __perf: { pointer: number[]; wheel: number[] } }).__perf);
  const drag = stats(perf.pointer);
  const zoom = stats(perf.wheel);
  const report = `PERF ${nodeCount} node, zoom ${zoomStart.toFixed(2)} → thấp nhất ${zoomLow.toFixed(2)} → ${zoomEnd.toFixed(2)}\nPERF kéo nền: ${fmt(drag)}\nPERF cuộn phóng to: ${fmt(zoom)}\nPERF từng bước cuộn (ms): ${perf.wheel.map((x) => x.toFixed(0)).join(" ")}`;
  console.log(report);
  test.info().annotations.push({ type: "perf", description: report });

  expect(drag.n).toBeGreaterThanOrEqual(DRAG_STEPS);
  expect(zoom.n).toBe(ZOOM_STEPS);
  // Lượt cuộn đi qua ngưỡng thu nhỏ (có lúc ở trên, có lúc ở dưới): khung hình đổi chế độ thẻ nằm trong số đo.
  expect(Math.max(zoomStart, zoomEnd)).toBeGreaterThanOrEqual(COMPACT_ZOOM);
  expect(zoomLow).toBeLessThan(COMPACT_ZOOM);
  expect(drag.avg).toBeLessThan(THRESHOLD_MS);
  expect(zoom.avg).toBeLessThan(THRESHOLD_MS);
  expect(zoom.max).toBeLessThan(MAX_STEP_MS);
});
