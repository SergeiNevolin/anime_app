/**
 * Typed access to the Telegram Mini App API.
 *
 * The whole application talks to Telegram through this module: the raw
 * `window.Telegram` object is never used directly in a component.  When the
 * application is opened in a normal browser the module falls back to a
 * controlled development implementation so that the UI stays usable.
 */

import { getRuntimeConfig } from "@/lib/runtime-config";

export type TelegramColorScheme = "light" | "dark";

export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
  [key: string]: string | undefined;
}

export interface TelegramInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export interface TelegramWebApp {
  readonly initData: string;
  readonly initDataUnsafe: {
    user?: TelegramUser;
    auth_date?: number;
    query_id?: string;
    start_param?: string;
  };
  readonly version: string;
  readonly platform: string;
  readonly colorScheme: TelegramColorScheme;
  readonly themeParams: TelegramThemeParams;
  readonly isExpanded: boolean;
  readonly isFullscreen?: boolean;
  readonly viewportHeight: number;
  readonly viewportStableHeight: number;
  readonly colorSchemeAvailable: boolean;
  /** Device safe area (notch, system bars). Bot API 8.0+. */
  readonly safeAreaInset?: TelegramInset;
  /** Area covered by the Telegram interface (header in fullscreen). Bot API 8.0+. */
  readonly contentSafeAreaInset?: TelegramInset;
  isVersionAtLeast?(version: string): boolean;
  requestFullscreen?(): void;
  exitFullscreen?(): void;
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  enableClosingConfirmation(): void;
  disableVerticalSwipes(): void;
  onEvent(event: string, handler: (...args: unknown[]) => void): void;
  offEvent(event: string, handler: (...args: unknown[]) => void): void;
  readonly BackButton: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
  readonly MainButton: {
    setText(text: string): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
  readonly HapticFeedback: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
}

type EventHandler = (...args: unknown[]) => void;

const _EVENTS = {
  themeChanged: "themeChanged",
  viewportChanged: "viewportChanged",
  safeAreaChanged: "safeAreaChanged",
  contentSafeAreaChanged: "contentSafeAreaChanged",
  fullscreenChanged: "fullscreenChanged",
  fullscreenFailed: "fullscreenFailed",
  backButtonClicked: "backButtonClicked",
  mainButtonClicked: "mainButtonClicked",
  closed: "closed",
  activated: "activated",
} as const;

export type TelegramEvent = (typeof _EVENTS)[keyof typeof _EVENTS];

const noop = (): void => undefined;

/**
 * Development fallback used when the application is not opened from Telegram.
 *
 * It implements the parts of the API that the application relies on and keeps
 * the raw `initData` empty, so the development authentication provider of the
 * backend is used instead.
 */
function createDevelopmentWebApp(): TelegramWebApp {
  const handlers = new Map<string, Set<EventHandler>>();
  const backButtonHandlers = new Set<() => void>();
  const mainButtonHandlers = new Set<() => void>();

  const on = (event: string, handler: EventHandler): void => {
    const bucket = handlers.get(event) ?? new Set<EventHandler>();
    bucket.add(handler);
    handlers.set(event, bucket);
  };
  const off = (event: string, handler: EventHandler): void => {
    handlers.get(event)?.delete(handler);
  };

  return {
    initData: "",
    initDataUnsafe: {},
    version: "7.0",
    platform: "web",
    colorScheme: "light",
    themeParams: {},
    isExpanded: false,
    isFullscreen: false,
    viewportHeight: 844,
    viewportStableHeight: 844,
    colorSchemeAvailable: true,
    safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    isVersionAtLeast: () => false,
    requestFullscreen: noop,
    exitFullscreen: noop,
    ready: noop,
    expand: noop,
    close: noop,
    setHeaderColor: noop,
    setBackgroundColor: noop,
    enableClosingConfirmation: noop,
    disableVerticalSwipes: noop,
    onEvent: on,
    offEvent: off,
    BackButton: {
      show: noop,
      hide: noop,
      onClick: (handler: () => void) => {
        backButtonHandlers.add(handler);
      },
      offClick: (handler: () => void) => {
        backButtonHandlers.delete(handler);
      },
    },
    MainButton: {
      setText: noop,
      show: noop,
      hide: noop,
      enable: noop,
      disable: noop,
      onClick: (handler: () => void) => {
        mainButtonHandlers.add(handler);
      },
      offClick: (handler: () => void) => {
        mainButtonHandlers.delete(handler);
      },
    },
    HapticFeedback: {
      impactOccurred: noop,
      notificationOccurred: noop,
      selectionChanged: noop,
    },
  };
}

function readTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") {
    return null;
  }
  const telegram = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram;
  return telegram?.WebApp ?? null;
}

/**
 * Return the Telegram WebApp instance, or the development fallback.
 */
export function getTelegram(): TelegramWebApp {
  if (typeof window === "undefined") {
    return createDevelopmentWebApp();
  }
  const webApp = readTelegramWebApp();
  if (!webApp) {
    return createDevelopmentWebApp();
  }
  return webApp;
}

/**
 * Return whether the application runs inside Telegram.
 */
export function isTelegramEnvironment(): boolean {
  return readTelegramWebApp() !== null;
}

/**
 * Return the raw `initData` string.
 *
 * The value is sent to the backend as-is and is never inspected on the
 * client: only the backend may trust it.
 */
export function getInitData(): string {
  return getTelegram().initData ?? "";
}

/**
 * Return whether dev authentication should be used.
 */
export function isDevAuthEnabled(): boolean {
  return getRuntimeConfig().devAuthEnabled;
}

/**
 * Return the dev auth credential.
 */
export function getDevAuthCredential(): string {
  return "dev";
}

/**
 * Subscribe to a Telegram event and return the unsubscribe function.
 */
export function onTelegramEvent(
  event: TelegramEvent,
  handler: EventHandler,
): () => void {
  const webApp = getTelegram();
  webApp.onEvent(event, handler);
  return () => webApp.offEvent(event, handler);
}

/**
 * Compare two Bot API versions such as `"8.0"` or `"7.10.1"`.
 */
function versionAtLeast(version: string, minimum: string): boolean {
  const parse = (value: string): number[] =>
    value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const current = parse(version);
  const required = parse(minimum);
  const length = Math.max(current.length, required.length);
  for (let index = 0; index < length; index += 1) {
    const left = current[index] ?? 0;
    const right = required[index] ?? 0;
    if (left !== right) {
      return left > right;
    }
  }
  return true;
}

/**
 * Whether the client can open the Mini App in fullscreen mode (Bot API 8.0+).
 *
 * Older clients keep the Telegram chrome on screen: the player falls back to
 * its own overlay there.
 */
export function canRequestTelegramFullscreen(): boolean {
  const webApp = readTelegramWebApp();
  if (!webApp || typeof webApp.requestFullscreen !== "function") {
    return false;
  }
  if (typeof webApp.isVersionAtLeast === "function") {
    return webApp.isVersionAtLeast("8.0");
  }
  return versionAtLeast(webApp.version ?? "", "8.0");
}

/**
 * Ask Telegram to hide its header and open the Mini App fullscreen.
 *
 * Returns whether the request was sent; the result itself is reported by the
 * `fullscreenChanged` / `fullscreenFailed` events.
 */
export function requestTelegramFullscreen(): boolean {
  if (!canRequestTelegramFullscreen()) {
    return false;
  }
  try {
    getTelegram().requestFullscreen?.();
    return true;
  } catch {
    return false;
  }
}

/** Return the Mini App to its normal windowed mode. */
export function exitTelegramFullscreen(): void {
  const webApp = readTelegramWebApp();
  if (!webApp || typeof webApp.exitFullscreen !== "function") {
    return;
  }
  try {
    webApp.exitFullscreen();
  } catch {
    // A client that cannot exit fullscreen ignores the request.
  }
}

/**
 * Show the Telegram back button and bind a handler to it.
 */
export function useBackButton(handler: () => void): void {
  const webApp = getTelegram();
  webApp.BackButton.onClick(handler);
  webApp.BackButton.show();
}
