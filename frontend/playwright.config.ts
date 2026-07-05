import { defineConfig } from "@playwright/test";

// E2E stack isolation: set PW_PORT (vite) + INAI_PORT (backend) to run against
// a dedicated dev server instead of reusing one already open in the browser.
//   INAI_PROVIDER=mock INAI_DATA_DIR=$(mktemp -d) uvicorn app.main:app --port 8011 &
//   PW_PORT=5199 INAI_PORT=8011 npx playwright test
const port = Number(process.env.PW_PORT ?? 5173);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: `http://localhost:${port}`, trace: "on-first-retry" },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
