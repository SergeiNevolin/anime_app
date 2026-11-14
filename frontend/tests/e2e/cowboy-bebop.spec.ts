import { test, expect } from "@playwright/test";

test.describe("Cowboy Bebop playback", () => {
  test("open homepage, search Cowboy Bebop, and play first episode", async ({ page }) => {
    // 1. Open homepage
    await page.goto("/");
    await expect(page).toHaveTitle(/Anime Watch/);

    // 2. Search for "Cowboy Bebop" (in Russian: "Ковбой Бибоп")
    const searchInput = page.locator('input[placeholder="Название аниме"]');
    await searchInput.fill("Ковбой Бибоп");
    await searchInput.press("Enter");

    // 3. Wait for search results
    await page.waitForSelector('text="Результаты поиска"', { timeout: 10000 });

    // 4. Click on first result (Cowboy Bebop)
    const firstResult = page.locator('a[href^="/anime/"]').first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();

    // 5. Wait for anime page to load
    await page.waitForURL(/\/anime\/.*/);
    await expect(page.locator("h1")).toContainText(/Ковбой Бибоп|Cowboy Bebop/);

    // 6. Wait for player to load and start playing
    // The player should auto-play the first episode
    await page.waitForSelector("video", { timeout: 15000 });

    // 7. Verify video element exists and is playing
    const video = page.locator("video");
    await expect(video).toBeVisible();

    // 8. Wait a bit for playback to start
    await page.waitForTimeout(3000);

    // 9. Check that video is playing (not paused)
    const isPlaying = await video.evaluate((el: HTMLVideoElement) => !el.paused);
    expect(isPlaying).toBe(true);

    // 10. Check current time > 0 (video is actually playing)
    const currentTime = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    expect(currentTime).toBeGreaterThan(0);
  });
});