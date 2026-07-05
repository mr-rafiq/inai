import { test, expect } from "@playwright/test";

// End-to-end: statement -> graph -> question -> grounded answer, plus orb state.
// Requires the backend running (INAI_PROVIDER=mock is fine) alongside Vite.
test("remembers a statement and answers from the graph", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img")).toHaveAttribute("data-orb-state", "idle");

  const input = page.getByLabel("Message Inai");
  await input.fill("I'm learning Spanish, my friend Alex teaches it");
  await page.getByRole("button", { name: "Send" }).click();

  // The memory panel should gain a Spanish node.
  await expect(page.locator('[data-node-name="Spanish"]')).toBeVisible({ timeout: 10_000 });

  // Ask a question -> answer references the stored fact.
  await input.fill("what am I learning?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator('[data-role="assistant"]').last()).toContainText(/Spanish/i, {
    timeout: 10_000,
  });
});
