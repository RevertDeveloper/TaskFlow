import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.TASKFLOW_E2E_BASE_URL;
const productionServer = process.env.TASKFLOW_E2E_MODE === "production";
const baseURL = externalBaseUrl ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: productionServer
          ? "rm -rf .next/standalone/public .next/standalone/.next/static && cp -R public .next/standalone/public && cp -R .next/static .next/standalone/.next/static && PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js"
          : "npm run dev -- --port 3100",
        url: "http://127.0.0.1:3100/login",
        reuseExistingServer: productionServer ? false : !process.env.CI,
        timeout: 120_000,
      },
});