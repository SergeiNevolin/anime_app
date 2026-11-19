"use client";

import { useEffect, type ReactNode } from "react";

import {
  getTelegram,
  isTelegramEnvironment,
  onTelegramEvent,
  type TelegramThemeParams,
} from "@/lib/telegram/webapp";


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
 * Initialise the Telegram Mini App and follow its theme and viewport.
 */
export function TelegramProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const webApp = getTelegram();
    webApp.ready();
    if (typeof webApp.expand === "function") {
      webApp.expand();
    }
    applyTelegramTheme(webApp.themeParams ?? {});
    applyViewportHeight();

    const offTheme = onTelegramEvent("themeChanged", () => {
      applyTelegramTheme(getTelegram().themeParams ?? {});
    });
    const offViewport = onTelegramEvent("viewportChanged", () => {
      applyViewportHeight();
    });

    return () => {
      offTheme();
      offViewport();
    };
  }, []);

  return <>{children}</>;
}
