import { defineConfig } from "@playwright/test";

// E2E runs against a live stack. run.sh (backend + frontend) should be up, or
// let Playwright boot the Vite dev server itself. The backend must be running
// separately (uv run uvicorn app.main:app) for the WebSocket flow to work.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:5173", trace: "on-first-retry" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
