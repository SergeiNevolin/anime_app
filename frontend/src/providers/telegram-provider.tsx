"use client";

import { useEffect, type ReactNode } from "react";

import {
  getTelegram,
  isTelegramEnvironment,
  onTelegramEvent,
  requestTelegramFullscreen,
  type TelegramThemeParams,
} from "@/lib/telegram/webapp";

const SAFE_AREA_SIDES = ["top", "right", "bottom", "left"] as const;

/**
 * Translate the Telegram theme parameters into CSS variables.
 *
 * The Mini App therefore always uses the colours chosen by the user in the
 * Telegram client.
 */
export function applyTelegramTheme(theme: TelegramThemeParams): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme)) {
    if (typeof value === "string" && value) {
      root.style.setProperty(`--tg-theme-${key.replace(/_/g, "-")}`, value);
    }
  }
  root.style.colorScheme = getTelegram().colorScheme;
}

/**
 * Keep the layout in sync with the height of the Mini App viewport.
 *
 * Outside Telegram the variable is removed, so the layout falls back to `dvh`
 * instead of the fictional height of the development stub.
 */
export function applyViewportHeight(): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  if (!isTelegramEnvironment()) {
    root.style.removeProperty("--app-viewport-height");
    return;
  }
  const webApp = getTelegram();
  root.style.setProperty("--app-viewport-height", `${webApp.viewportHeight}px`);
}

/**
 * Publish the safe areas as CSS variables.
 *
 * In fullscreen mode the Telegram interface floats above the page, so the
 * header has to step aside.  The two insets are different things and have to
 * be summed up: `safeAreaInset` is the device (notch, system bars) and
 * `contentSafeAreaInset` is the Telegram interface itself.
 *
 * The values are only written inside Telegram, so a regular browser keeps
 * using the CSS `env(safe-area-inset-*)` fallback.
 */
export function applySafeAreas(): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  if (!isTelegramEnvironment()) {
    for (const side of SAFE_AREA_SIDES) {
      root.style.removeProperty(`--app-safe-area-${side}`);
    }
    return;
  }

  const webApp = getTelegram();
  const device = webApp.safeAreaInset;
  const content = webApp.contentSafeAreaInset;
  for (const side of SAFE_AREA_SIDES) {
    const inset = (device?.[side] ?? 0) + (content?.[side] ?? 0);
    root.style.setProperty(`--app-safe-area-${side}`, `${inset}px`);
  }
}

/**
 * Give the transparent Telegram header a colour that matches the app, so the
 * status bar and the system controls stay readable in fullscreen mode.
 */
function applyHeaderColor(): void {
  const webApp = getTelegram();
  if (typeof webApp.setHeaderColor !== "function") {
    return;
  }
  const theme = webApp.themeParams ?? {};
  const color = theme.header_bg_color || theme.bg_color;
  if (!color) {
    return;
  }
  try {
    webApp.setHeaderColor(color);
  } catch {
    // An older client may reject the colour, the theme still applies.
  }
}

/**
 * Initialise the Telegram Mini App and follow its theme, viewport and safe
 * areas.
 */
export function TelegramProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const webApp = getTelegram();
    webApp.ready();
    if (typeof webApp.expand === "function") {
      webApp.expand();
    }
    applyTelegramTheme(webApp.themeParams ?? {});
    applyHeaderColor();
    applyViewportHeight();
    applySafeAreas();
    // Expand only maximises the Mini App inside the Telegram frame; the app
    // has to ask for fullscreen explicitly (Bot API 8.0+, no-op elsewhere).
    requestTelegramFullscreen();

    const refresh = (): void => {
      applySafeAreas();
      applyViewportHeight();
    };

    const offTheme = onTelegramEvent("themeChanged", () => {
      applyTelegramTheme(getTelegram().themeParams ?? {});
      applyHeaderColor();
    });
    const offViewport = onTelegramEvent("viewportChanged", refresh);
    const offSafeArea = onTelegramEvent("safeAreaChanged", refresh);
    const offContentSafeArea = onTelegramEvent(
      "contentSafeAreaChanged",
      refresh,
    );
    const offFullscreen = onTelegramEvent("fullscreenChanged", refresh);

    return () => {
      offTheme();
      offViewport();
      offSafeArea();
      offContentSafeArea();
      offFullscreen();
    };
  }, []);

  return <>{children}</>;
}
