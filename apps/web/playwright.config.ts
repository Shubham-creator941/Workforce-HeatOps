import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @heatops/api exec tsx ../web/e2e/demo-api.ts",
      url: "http://127.0.0.1:3100/api/v1/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm build && pnpm exec vite preview --host 127.0.0.1",
      url: "http://127.0.0.1:4173/mission",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
