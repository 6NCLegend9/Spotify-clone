const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // One worker per browser/device project keeps resource usage bounded while
  // avoiding a serialized 130-case matrix that can exceed the CI job timeout.
  workers: process.env.CI ? 5 : 1,
  timeout: 120000,
  expect: { timeout: 30000 },
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || (process.env.CI ? "http://localhost:3100" : "http://localhost:3000"),
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "firefox-desktop",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "webkit-desktop",
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 15"] },
    },
  ],
  webServer: process.env.CI ? {
    command: "node node_modules/next/dist/bin/next start --port 3100",
    url: "http://localhost:3100/search",
    reuseExistingServer: false,
    timeout: 120000,
  } : undefined,
});