import path from "node:path";
import { defineConfig } from "@playwright/test";

const API_PORT = "8797";
const WEB_PORT = "5197";
const DATA_DIR = path.join(import.meta.dirname, ".data-test", `e2e-${Date.now()}`);
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    channel: isCI ? undefined : "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npx tsx src/server.ts",
      url: `http://127.0.0.1:${API_PORT}/api/workflows/default`,
      env: { APP_ENV: "test", PORT: API_PORT, DATA_DIR },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npx vite",
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { PORT: API_PORT, WEB_PORT },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
