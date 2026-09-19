import { defineConfig } from "@playwright/test";

// Runs against an already-running intranet (a preview or production URL), never
// starts one itself: `E2E_BASE_URL=https://… bun run e2e`.
export default defineConfig({
  testDir: "./e2e",
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
  },
});
