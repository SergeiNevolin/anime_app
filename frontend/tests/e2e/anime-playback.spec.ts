import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * The end to end scenarios run against the deterministic `fixture` provider of
 * the backend, so they never depend on the availability of an external anime
 * site.
 *
 * Start the API before running them:
 *
 * ```bash
 * cd backend
 * uv run --env-file .env.e2e uvicorn anime_app.main:app --port 8000
 * ```
 */

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000/api/v1";
const DEV_AUTH = { Authorization: "dev dev" };

/**
 * Install a mock Telegram environment before the application is loaded.
 *
 * The payload is empty, so the application uses its development fallback and
 * does not send an authorization header of its own.
 */
async function installTelegramMock(page: Page) {
  await page.addInitScript(() => {
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>();

    const webApp = {
      initData: "",
      initDataUnsafe: {},
      version: "7.0",
      platform: "web",
      colorScheme: "light",
      themeParams: {
        bg_color: "#ffffff",
        text_color: "#101828",
        hint_color: "#667085",
        link_color: "#2f6fed",
        button_color: "#2f6fed",
        button_text_color: "#ffffff",
        secondary_bg_color: "#f2f4f7",
      },
      isExpanded: true,
      viewportHeight: 844,
      viewportStableHeight: 844,
      colorSchemeAvailable: true,
      ready: () => {},
      expand: () => {},
      close: () => {},
      setHeaderColor: () => {},
      setBackgroundColor: () => {},
      enableClosingConfirmation: () => {},
      disableVerticalSwipes: () => {},
      onEvent: (event: string, handler: (...args: unknown[]) => void) => {
        const bucket = handlers.get(event) ?? new Set();
        bucket.add(handler);
        handlers.set(event, bucket);
      },
      offEvent: (event: string, handler: (...args: unknown[]) => void) => {
        handlers.get(event)?.delete(handler);
      },
      BackButton: {
        show: () => {},
        hide: () => {},
        onClick: () => {},
        offClick: () => {},
      },
      MainButton: {
        setText: () => {},
        show: () => {},
        hide: () => {},
        enable: () => {},
        disable: () => {},
        onClick: () => {},
        offClick: () => {},
      },
      HapticFeedback: {
        impactOccurred: () => {},
        notificationOccurred: () => {},
        selectionChanged: () => {},
      },
    };

    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };
  });
}

/**
 * Look up the identifier of a title in the catalogue.
 */
async function findAnimeId(
  request: APIRequestContext,
  query: string,
): Promise<string> {
  const response = await request.get(`${API_URL}/anime/search`, {
    headers: DEV_AUTH,
    params: { query },
  });
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    items: Array<{ anime_id: string | null; title: string }>;
  };
  const match = payload.items.find((item) => item.anime_id);
  expect(match, `the catalogue has to contain "${query}"`).toBeTruthy();
  return match!.anime_id as string;
}

/**
 * Put a title into the library, so the scenario does not depend on the order
 * of the tests.
 */
async function addToLibrary(
  request: APIRequestContext,
  animeId: string,
  status = "plan_to_watch",
) {
  const response = await request.post(`${API_URL}/library`, {
    headers: DEV_AUTH,
    data: { anime_id: animeId, status },
  });
  expect([200, 201]).toContain(response.status());
}

/**
 * Open the card of a title through the search of the home screen.
 */
async function openAnime(page: Page, title: string) {
  await page.goto("/");
  await page.getByLabel("Название аниме").fill(title);
  const card = page.getByTestId("anime-card").first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  await expect(page).toHaveURL(/\/anime\//);
}

test.describe("Telegram Anime Mini App", () => {
  test.beforeEach(async ({ page }) => {
    await installTelegramMock(page);
  });

  test("1. the application opens with a mocked Telegram environment", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Anime Watch/);
    await expect(page.getByLabel("Название аниме")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Продолжить просмотр" }),
    ).toBeVisible();
  });

  test("2. the user is authenticated", async ({ page }) => {
    await page.goto("/library");

    // The library is only reachable for an authenticated user, so the
    // absence of the "authorisation required" state proves the login.
    await expect(
      page.getByRole("heading", { name: "Библиотека" }),
    ).toBeVisible();
    await expect(page.getByText("Требуется авторизация")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Все" })).toBeVisible();
  });

  test("3. an anime is found by its name", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Название аниме").fill("Ковбой");

    await expect(
      page.getByRole("heading", { name: /Результаты поиска/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("anime-card").first()).toBeVisible();
  });

  test("4. the card of an anime opens", async ({ page }) => {
    await openAnime(page, "Ковбой");

    await expect(
      page.getByRole("heading", { level: 2, name: "Ковбой Бибоп" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("5. the episodes of an anime are listed", async ({ page }) => {
    await openAnime(page, "Ковбой");

    await expect(page.getByLabel("Серия")).toBeVisible({ timeout: 15_000 });
    const options = await page.getByLabel("Серия").locator("option").count();
    expect(options).toBeGreaterThan(0);
  });

  test("6. an allowed source can be selected", async ({ page }) => {
    await openAnime(page, "Наруто");

    await expect(page.getByLabel("Серия")).toBeVisible({ timeout: 15_000 });

    // The fixture provider offers two dubs for the title.
    await expect(page.getByLabel("Озвучка")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Озвучка").selectOption({ index: 1 });
    await expect(page.getByTestId("video-player")).toBeVisible();
  });

  test("7. an anime is added to the library", async ({ page, request }) => {
    const animeId = await findAnimeId(request, "Ковбой");
    await request.delete(`${API_URL}/library/${animeId}`, { headers: DEV_AUTH });

    await openAnime(page, "Ковбой");

    await expect(
      page.getByRole("button", { name: "В библиотеку" }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "В библиотеку" }).click();

    await expect(
      page.getByRole("button", { name: "В библиотеку" }),
    ).toHaveCount(0, { timeout: 15_000 });
  });

  test("8. the status of an entry can be changed", async ({ page, request }) => {
    const animeId = await findAnimeId(request, "Ковбой");
    await addToLibrary(request, animeId);

    await openAnime(page, "Ковбой");

    await page.getByRole("button", { name: "Просмотрено" }).click();

    await page.goto("/library");
    await expect(page.getByLabel("Статус просмотра").first()).toHaveValue(
      "completed",
      { timeout: 15_000 },
    );
  });

  test("9. the progress of an entry can be changed", async ({ page, request }) => {
    const animeId = await findAnimeId(request, "Ковбой");
    await addToLibrary(request, animeId);

    await openAnime(page, "Ковбой");

    await page.getByLabel("Прогресс:").fill("2");
    await page.getByLabel("Прогресс:").blur();

    await page.goto("/library");
    await expect(page.getByLabel("Прогресс просмотра").first()).toHaveValue("2", {
      timeout: 15_000,
    });
  });
});
