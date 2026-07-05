import { chromium } from "@playwright/test";
const out = process.env.OUT_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173");
await page.waitForTimeout(3000);
// brain explorer full screen + search focus
await page.getByLabel("Expand graph").click();
await page.waitForTimeout(800);
await page.getByLabel("Search brain explorer").fill("pavi");
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/brain-explorer2.png` });
await page.getByLabel("Close brain explorer").click();
// scroll chat to show the file list view fully
const list = page.locator('[data-testid="view-file-list"]').last();
await list.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/file-view2.png` });
await browser.close();
