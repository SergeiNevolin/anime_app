import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { QueryProvider } from "@/providers/query-provider";
import {
  TelegramProvider,
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
};

beforeEach(() => {
  vi.clearAllMocks();
  webAppMock.themeParams = {};
  webAppMock.colorScheme = "light";
  webAppMock.viewportHeight = 800;
  (window as unknown as { Telegram?: unknown }).Telegram = { WebApp: webAppMock };
});

afterEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  document.documentElement.style.removeProperty("--tg-theme-bg-color");
  document.documentElement.style.removeProperty("--app-viewport-height");
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

  it("subscribes to the theme and the viewport events", async () => {
    render(
      <TelegramProvider>
        <p>Контент</p>
      </TelegramProvider>,
    );

    await waitFor(() => expect(webAppMock.onEvent).toHaveBeenCalledTimes(2));
    const events = webAppMock.onEvent.mock.calls.map((call) => call[0]);
    expect(events).toContain("themeChanged");
    expect(events).toContain("viewportChanged");
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

  it("drops the height outside of Telegram", () => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
    document.documentElement.style.setProperty("--app-viewport-height", "500px");

    applyViewportHeight();

    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-height"),
    ).toBe("");
  });
});
