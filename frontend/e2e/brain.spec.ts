import { test, expect } from "@playwright/test";

// Full journey: onboarding (seeds the brain from "about you") -> main app ->
// question answered from the graph. Requires the backend running against a
// FRESH data dir (INAI_PROVIDER=mock), e.g.:
//   INAI_PROVIDER=mock INAI_DATA_DIR=$(mktemp -d) uvicorn app.main:app
test("onboards, seeds the brain, and answers from memory", async ({ page }) => {
  await page.goto("/");

  // --- onboarding wizard (F5) ---
  await expect(page.getByText("Hello, I'm Inai.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Get started" }).click();

  await page.getByLabel("Your name").fill("Tester");
  await page
    .getByLabel("About you")
    .fill("I'm learning Spanish, my friend Alex teaches it");
  await page.getByRole("button", { name: "Continue" }).click();

  // pick the Demo (mock) provider so no model is needed
  await page.getByRole("button", { name: /Demo/ }).click();
  await page.getByRole("button", { name: "Start using Inai" }).click();

  // --- main app: brain was seeded from the about-text ---
  await expect(page.getByRole("img")).toHaveAttribute("data-orb-state", /idle|speaking/, {
    timeout: 15_000,
  });
  await expect(page.locator('[data-node-name="Spanish"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-node-name="Alex"]')).toBeVisible();

  // --- ask a question -> grounded answer from the graph ---
  const input = page.getByLabel("Message Inai");
  await input.fill("what am I learning?");
  await page.getByRole("button", { name: "Send" }).click();

  const answer = page.locator('[data-role="assistant"][data-pending="false"]').last();
  await expect(answer).toContainText(/Spanish/i, { timeout: 10_000 });
});
