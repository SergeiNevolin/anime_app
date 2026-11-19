import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { QueryProvider } from "@/providers/query-provider";
import {
  TelegramProvider,
  applySafeAreas,
  applyTelegramTheme,
  applyViewportHeight,
} from "@/providers/telegram-provider";

const webAppMock = {
  initData: "auth_date=1&hash=abc",
  ready: vi.fn(),
  expand: vi.fn(),
  close: vi.fn(),
  onEvent: vi.fn(),
  offEvent: vi.fn(),
  themeParams: {} as Record<string, string>,
  colorScheme: "light" as "light" | "dark",
  viewportHeight: 800,
  version: "8.0",
  setHeaderColor: vi.fn(),
  requestFullscreen: vi.fn(),
  safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
  contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  webAppMock.themeParams = {};
  webAppMock.colorScheme = "light";
  webAppMock.viewportHeight = 800;
  webAppMock.safeAreaInset = { top: 0, bottom: 0, left: 0, right: 0 };
  webAppMock.contentSafeAreaInset = { top: 0, bottom: 0, left: 0, right: 0 };
  (window as unknown as { Telegram?: unknown }).Telegram = { WebApp: webAppMock };
});

afterEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  document.documentElement.style.removeProperty("--tg-theme-bg-color");
  document.documentElement.style.removeProperty("--app-viewport-height");
  for (const side of ["top", "right", "bottom", "left"]) {
    document.documentElement.style.removeProperty(`--app-safe-area-${side}`);
  }
});

describe("QueryProvider", () => {
  it("renders its children", () => {
    render(
      <QueryProvider>
        <p>Контент</p>
      </QueryProvider>,
    );

    expect(screen.getByText("Контент")).toBeInTheDocument();
  });
});

describe("TelegramProvider", () => {
  it("initialises the Mini App", async () => {
    render(
      <TelegramProvider>
        <p>Контент</p>
      </TelegramProvider>,
    );

    await waitFor(() => expect(webAppMock.ready).toHaveBeenCalled());
    expect(webAppMock.expand).toHaveBeenCalled();
  });

  it("applies the theme of the Telegram client", async () => {
    webAppMock.themeParams = { bg_color: "#123456", text_color: "#654321" };

    render(
      <TelegramProvider>
        <p>Контент</p>
      </TelegramProvider>,
    );

    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue("--tg-theme-bg-color"),
      ).toBe("#123456"),
    );
  });

  it("subscribes to the theme, the viewport and the safe areas", async () => {
    render(
      <TelegramProvider>
        <p>Контент</p>
      </TelegramProvider>,
    );

    await waitFor(() => expect(webAppMock.onEvent).toHaveBeenCalled());
    const events = webAppMock.onEvent.mock.calls.map((call) => call[0]);
    expect(events).toEqual(
      expect.arrayContaining([
        "themeChanged",
        "viewportChanged",
        "safeAreaChanged",
        "contentSafeAreaChanged",
        "fullscreenChanged",
      ]),
    );
  });

  it("asks Telegram for the fullscreen mode", async () => {
    render(
      <TelegramProvider>
        <p>Контент</p>
      </TelegramProvider>,
    );

    await waitFor(() =>
      expect(webAppMock.requestFullscreen).toHaveBeenCalled(),
    );
  });

  it("passes the header colour to the client", async () => {
    webAppMock.themeParams = { header_bg_color: "#101010" };

    render(
      <TelegramProvider>
        <p>Контент</p>
      </TelegramProvider>,
    );

    await waitFor(() =>
      expect(webAppMock.setHeaderColor).toHaveBeenCalledWith("#101010"),
    );
  });
});

describe("theme helpers", () => {
  it("writes the theme parameters as CSS variables", () => {
    applyTelegramTheme({ bg_color: "#abcdef", link_color: "#fedcba" });

    expect(
      document.documentElement.style.getPropertyValue("--tg-theme-bg-color"),
    ).toBe("#abcdef");
    expect(
      document.documentElement.style.getPropertyValue("--tg-theme-link-color"),
    ).toBe("#fedcba");
  });

  it("ignores the empty values", () => {
    applyTelegramTheme({ bg_color: "" });

    expect(
      document.documentElement.style.getPropertyValue("--tg-theme-bg-color"),
    ).toBe("");
  });

  it("publishes the height of the viewport", () => {
    applyViewportHeight();

    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-height"),
    ).toBe("800px");
  });

  it("sums the device and the Telegram content insets", () => {
    webAppMock.safeAreaInset = { top: 10, bottom: 34, left: 0, right: 0 };
    webAppMock.contentSafeAreaInset = { top: 46, bottom: 20, left: 0, right: 0 };

    applySafeAreas();

    expect(
      document.documentElement.style.getPropertyValue("--app-safe-area-top"),
    ).toBe("56px");
    expect(
      document.documentElement.style.getPropertyValue("--app-safe-area-bottom"),
    ).toBe("54px");
  });

  it("drops the insets outside of Telegram", () => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
    document.documentElement.style.setProperty("--app-safe-area-top", "30px");

    applySafeAreas();

    expect(
      document.documentElement.style.getPropertyValue("--app-safe-area-top"),
    ).toBe("");
  });

  it("drops the height outside of Telegram", () => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
    document.documentElement.style.setProperty("--app-viewport-height", "500px");

    applyViewportHeight();

    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-height"),
    ).toBe("");
  });
});
