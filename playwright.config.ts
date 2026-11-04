import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

if (!process.env.WAYFARER_DB_PATH) throw new Error("Run browser tests with npm run test:e2e to isolate their database.");

export default defineConfig({
  testDir: "./web/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    channel: "chrome",
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node --import tsx api/src/server.ts",
      env: { PORT: "3101" },
      url: "http://127.0.0.1:3101/api/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "node ../node_modules/next/dist/bin/next dev -p 3100",
      cwd: resolve(__dirname, "web"),
      env: { API_URL: "http://127.0.0.1:3101" },
      // Readiness compiles the actual directory before Chrome starts hydrating it.
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
