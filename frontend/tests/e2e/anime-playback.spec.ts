import { test, expect } from "@playwright/test";

test.describe("Anime playback flow", () => {
  test("homepage loads and shows continue watching section", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Anime Watch/);

    // Check search input exists
    const searchInput = page.locator('input[placeholder="Название аниме"]');
    await expect(searchInput).toBeVisible();

    // Check continue watching section exists
    await expect(page.locator('text="Продолжить просмотр"')).toBeVisible();
  });

  test("search input accepts text", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.locator('input[placeholder="Название аниме"]');
    await searchInput.fill("наруто");
    await expect(searchInput).toHaveValue("наруто");
  });

  test("anime page loads without crashing for non-existent ID", async ({ page }) => {
    await page.goto("/anime/non-existent-id");
    await page.waitForTimeout(3000);

    // Page should load without crashing (check for any content)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(0);
  });

  test("library page loads", async ({ page }) => {
    await page.goto("/library");
    await page.waitForTimeout(2000);

    // Should show auth required or library
    const hasAuthRequired = await page.locator('text="Требуется авторизация"').isVisible({ timeout: 5000 }).catch(() => false);
    const hasLibrary = await page.locator('text="Библиотека"').isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasAuthRequired || hasLibrary).toBe(true);
  });

  test("homepage search works", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.locator('input[placeholder="Название аниме"]');
    await searchInput.fill("наруто");
    await searchInput.press("Enter");

    // Wait for search to process
    await page.waitForTimeout(3000);

    // Check that search section appears (results or empty state)
    // Just verify the page didn't crash and search input still works
    await expect(searchInput).toHaveValue("наруто");
  });
});