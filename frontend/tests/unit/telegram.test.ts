import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  canRequestTelegramFullscreen,
  exitTelegramFullscreen,
  getInitData,
  getTelegram,
  isTelegramEnvironment,
  onTelegramEvent,
  requestTelegramFullscreen,
} from "@/lib/telegram/webapp";

interface FakeWebApp {
  initData: string;
  ready: ReturnType<typeof vi.fn>;
  expand: ReturnType<typeof vi.fn>;
  onEvent: ReturnType<typeof vi.fn>;
  offEvent: ReturnType<typeof vi.fn>;
  BackButton: { show: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> };
  version?: string;
  isVersionAtLeast?: (version: string) => boolean;
  requestFullscreen?: ReturnType<typeof vi.fn>;
  exitFullscreen?: ReturnType<typeof vi.fn>;
}

function installFakeWebApp(initData = "auth_date=1&hash=abc"): FakeWebApp {
  const fake: FakeWebApp = {
    initData,
    ready: vi.fn(),
    expand: vi.fn(),
    onEvent: vi.fn(),
    offEvent: vi.fn(),
    BackButton: { show: vi.fn(), hide: vi.fn() },
  };
  (window as unknown as { Telegram?: unknown }).Telegram = { WebApp: fake };
  return fake;
}

describe("Telegram integration layer", () => {
  beforeEach(() => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  afterEach(() => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  it("falls back to the development implementation outside of Telegram", () => {
    expect(isTelegramEnvironment()).toBe(false);

    const webApp = getTelegram();

    expect(webApp.initData).toBe("");
    expect(() => webApp.ready()).not.toThrow();
    expect(() => webApp.expand()).not.toThrow();
  });

  it("uses the WebApp of the Telegram client when it is available", () => {
    const fake = installFakeWebApp("auth_date=1&hash=def");

    expect(isTelegramEnvironment()).toBe(true);
    expect(getTelegram().initData).toBe("auth_date=1&hash=def");
    expect(fake.initData).toBe("auth_date=1&hash=def");
  });

  it("returns the raw init data", () => {
    installFakeWebApp("query_id=AAH&user=%7B%22id%22%3A1%7D&hash=xyz");

    expect(getInitData()).toBe(
      "query_id=AAH&user=%7B%22id%22%3A1%7D&hash=xyz",
    );
  });

  it("never reads the unsafe payload", () => {
    installFakeWebApp("auth_date=1&hash=abc");

    // The client only forwards the raw string, the backend validates it.
    expect(getInitData()).not.toContain("initDataUnsafe");
  });

  it("subscribes and unsubscribes from an event", () => {
    const fake = installFakeWebApp();
    const handler = vi.fn();

    const unsubscribe = onTelegramEvent("themeChanged", handler);

    expect(fake.onEvent).toHaveBeenCalledWith("themeChanged", handler);

    unsubscribe();

    expect(fake.offEvent).toHaveBeenCalledWith("themeChanged", handler);
  });

  it("requests and exits the fullscreen mode on a supporting client", () => {
    const fake = installFakeWebApp();
    fake.version = "8.0";
    fake.requestFullscreen = vi.fn();
    fake.exitFullscreen = vi.fn();

    expect(canRequestTelegramFullscreen()).toBe(true);
    expect(requestTelegramFullscreen()).toBe(true);
    expect(fake.requestFullscreen).toHaveBeenCalled();

    exitTelegramFullscreen();

    expect(fake.exitFullscreen).toHaveBeenCalled();
  });

  it("uses the version check of the client when it is available", () => {
    const fake = installFakeWebApp();
    const isVersionAtLeast = vi.fn((version: string) => version === "8.0");
    fake.isVersionAtLeast = isVersionAtLeast;
    fake.requestFullscreen = vi.fn();

    expect(requestTelegramFullscreen()).toBe(true);
    expect(isVersionAtLeast).toHaveBeenCalledWith("8.0");
  });

  it("does not request the fullscreen mode on an older client", () => {
    const fake = installFakeWebApp();
    fake.version = "7.10";
    fake.requestFullscreen = vi.fn();

    expect(canRequestTelegramFullscreen()).toBe(false);
    expect(requestTelegramFullscreen()).toBe(false);
    expect(fake.requestFullscreen).not.toHaveBeenCalled();
  });

  it("ignores the fullscreen requests outside of Telegram", () => {
    expect(canRequestTelegramFullscreen()).toBe(false);
    expect(requestTelegramFullscreen()).toBe(false);
    expect(() => exitTelegramFullscreen()).not.toThrow();
  });

  it("supports the back button of the Telegram client", () => {
    const fake = installFakeWebApp();

    getTelegram().BackButton.show();
    getTelegram().BackButton.hide();

    expect(fake.BackButton.show).toHaveBeenCalled();
    expect(fake.BackButton.hide).toHaveBeenCalled();
  });
});
